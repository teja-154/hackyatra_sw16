import { Router } from 'express';
import Signal from '../models/Signal.js';
import Incident from '../models/Incident.js';

const router = Router();

/**
 * GET /api/status/:id
 * Citizen looks up complaint by incident ID, signal ID, or phone number.
 * Returns incident details with full statusHistory timeline.
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    let incident;

    // Try as incident ID
    if (id.match(/^[0-9a-fA-F]{24}$/)) {
      incident = await Incident.findById(id)
        .populate('department', 'name')
        .populate('assignedTeam', 'name');
    }

    // Try as phone number if not found
    if (!incident) {
      const signal = await Signal.findOne({ phone: id }).sort({ createdAt: -1 });
      if (signal?.incident) {
        incident = await Incident.findById(signal.incident)
          .populate('department', 'name')
          .populate('assignedTeam', 'name');
      }
    }

    if (!incident) {
      return res.status(404).json({ error: 'Complaint not found — check your ID and try again' });
    }

    // Get all signals linked to this incident
    const signals = await Signal.find({ incident: incident._id }).sort({ createdAt: 1 });

    res.json({
      id: incident._id,
      status: incident.status,
      category: incident.category,
      ward: incident.ward,
      urgency: incident.urgency,
      department: incident.department?.name || 'GVMC General',
      assignedTeam: incident.assignedTeam?.name || null,
      occurrenceCount: incident.occurrenceCount,
      sources: incident.sources,
      timeline: incident.statusHistory,
      signals: signals.map((s) => ({
        id: s._id,
        source: s.source,
        description: s.description,
        photoUrl: s.photoUrl,
        createdAt: s.createdAt,
      })),
      createdAt: incident.createdAt,
      resolvedAt: incident.resolvedAt,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
