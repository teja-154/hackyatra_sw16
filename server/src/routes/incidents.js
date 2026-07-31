import { Router } from 'express';
import Incident from '../models/Incident.js';
import Signal from '../models/Signal.js';
import Department from '../models/Department.js';
import FieldTeam from '../models/FieldTeam.js';
import { authMiddleware } from '../middleware/auth.js';
import { emitIncidentUpdate } from '../services/socketManager.js';
import { assignNearestTeam } from '../services/teamAssigner.js';

const router = Router();

/** GET /api/incidents — filtered queue */
router.get('/', async (req, res) => {
  try {
    const filter = {};
    if (req.query.department) filter.department = String(req.query.department);
    if (req.query.ward) filter.ward = String(req.query.ward);
    if (req.query.status) filter.status = String(req.query.status);
    if (req.query.urgency) filter.urgency = String(req.query.urgency);

    const incidents = await Incident.find(filter)
      .sort({ priorityScore: -1 })
      .populate('department', 'name code')
      .populate('assignedTeam', 'name ward')
      .limit(200);

    res.json(incidents);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** GET /api/incidents/:id — full detail with signals */
router.get('/:id', async (req, res) => {
  try {
    const incident = await Incident.findById(req.params.id)
      .populate('department', 'name code')
      .populate('assignedTeam', 'name ward');

    if (!incident) return res.status(404).json({ error: 'Incident not found' });

    const signals = await Signal.find({ incident: incident._id })
      .sort({ createdAt: 1 });

    res.json({ ...incident.toObject(), signals });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** POST /api/incidents/:id/acknowledge — reported → acknowledged */
router.post('/:id/acknowledge', authMiddleware, async (req, res) => {
  try {
    const incident = await Incident.findOneAndUpdate(
      { _id: req.params.id, status: 'reported' },
      {
        status: 'acknowledged',
        $push: {
          statusHistory: {
            status: 'acknowledged',
            changedBy: `dept:${req.departmentName}`,
            note: 'Incident acknowledged',
            timestamp: new Date(),
          },
        },
      },
      { new: true }
    ).populate('department', 'name');

    if (!incident) {
      return res.status(409).json({ error: 'Incident not in reported state — may be already acknowledged' });
    }

    emitIncidentUpdate(incident.toObject());
    res.json(incident);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** POST /api/incidents/:id/accept — acknowledged → assigned (optimistic lock) */
router.post('/:id/accept', authMiddleware, async (req, res) => {
  try {
    // Find and assign nearest team
    const incidentBefore = await Incident.findById(req.params.id);
    if (!incidentBefore) return res.status(404).json({ error: 'Incident not found' });

    const team = await assignNearestTeam(incidentBefore);

    const incident = await Incident.findOneAndUpdate(
      {
        _id: req.params.id,
        status: { $in: ['reported', 'acknowledged'] },
      },
      {
        status: 'assigned',
        assignedTeam: team?._id || null,
        $push: {
          statusHistory: {
            status: 'assigned',
            changedBy: `dept:${req.departmentName}`,
            note: team ? `Assigned to ${team.name}` : 'Accepted — no team auto-assigned',
            timestamp: new Date(),
          },
        },
      },
      { new: true }
    ).populate('department', 'name').populate('assignedTeam', 'name ward');

    if (!incident) {
      return res.status(409).json({ error: 'Already assigned — another department accepted first' });
    }

    emitIncidentUpdate(incident.toObject());
    res.json(incident);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** POST /api/incidents/:id/start — assigned → in_progress */
router.post('/:id/start', authMiddleware, async (req, res) => {
  try {
    const incident = await Incident.findOneAndUpdate(
      { _id: req.params.id, status: 'assigned' },
      {
        status: 'in_progress',
        $push: {
          statusHistory: {
            status: 'in_progress',
            changedBy: `dept:${req.departmentName}`,
            note: 'Work started on site',
            timestamp: new Date(),
          },
        },
      },
      { new: true }
    ).populate('department', 'name').populate('assignedTeam', 'name');

    if (!incident) {
      return res.status(409).json({ error: 'Incident not in assigned state' });
    }

    emitIncidentUpdate(incident.toObject());
    res.json(incident);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** POST /api/incidents/:id/resolve — in_progress → resolved_verified */
router.post('/:id/resolve', authMiddleware, async (req, res) => {
  try {
    const { photo_url } = req.body;

    const incident = await Incident.findOneAndUpdate(
      { _id: req.params.id, status: { $in: ['in_progress', 'assigned'] } },
      {
        status: 'resolved_verified',
        resolutionPhotoUrl: photo_url,
        resolvedAt: new Date(),
        $push: {
          statusHistory: {
            status: 'resolved_verified',
            changedBy: `dept:${req.departmentName}`,
            note: 'Issue resolved and verified',
            timestamp: new Date(),
          },
        },
      },
      { new: true }
    ).populate('department', 'name').populate('assignedTeam', 'name');

    if (!incident) {
      return res.status(409).json({ error: 'Incident not in in_progress state' });
    }

    // Release the team
    if (incident.assignedTeam) {
      await FieldTeam.findByIdAndUpdate(incident.assignedTeam._id, { status: 'available' });
    }

    emitIncidentUpdate(incident.toObject());
    res.json(incident);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** POST /api/incidents/:id/reroute — reassign to different department */
router.post('/:id/reroute', authMiddleware, async (req, res) => {
  try {
    const { department_id, reason } = req.body;
    if (!department_id || !reason) {
      return res.status(400).json({ error: 'department_id and reason are required' });
    }

    const dept = await Department.findById(department_id);
    if (!dept) return res.status(404).json({ error: 'Department not found' });

    // Release current team if any
    const current = await Incident.findById(req.params.id);
    if (current?.assignedTeam) {
      await FieldTeam.findByIdAndUpdate(current.assignedTeam, { status: 'available' });
    }

    const incident = await Incident.findByIdAndUpdate(
      req.params.id,
      {
        department: dept._id,
        status: 'reported',
        assignedTeam: null,
        $push: {
          statusHistory: {
            status: 'rerouted',
            changedBy: `dept:${req.departmentName}`,
            note: `Rerouted to ${dept.name}: ${reason}`,
            timestamp: new Date(),
          },
        },
      },
      { new: true }
    ).populate('department', 'name');

    emitIncidentUpdate(incident.toObject());
    res.json(incident);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
