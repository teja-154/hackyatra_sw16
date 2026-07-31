import { Router } from 'express';
import FieldTeam from '../models/FieldTeam.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

/** GET /api/teams — all teams with positions */
router.get('/', async (_req, res) => {
  try {
    const teams = await FieldTeam.find()
      .populate('department', 'name')
      .sort({ ward: 1 });
    res.json(teams);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/teams/:id/ping — field team GPS update
 * Debounced: accepts at most 1 ping per team per 15s
 */
const lastPingTimes = new Map();

router.post('/:id/ping', authMiddleware, async (req, res) => {
  try {
    const { lat, lon } = req.body;
    if (lat == null || lon == null) {
      return res.status(400).json({ error: 'lat and lon are required' });
    }

    // Debounce: 15 seconds per team
    const teamId = req.params.id;
    const now = Date.now();
    const lastPing = lastPingTimes.get(teamId) || 0;
    if (now - lastPing < 15000) {
      return res.json({ debounced: true });
    }
    lastPingTimes.set(teamId, now);

    const team = await FieldTeam.findOneAndUpdate(
      { _id: teamId, department: req.departmentId },
      {
        location: {
          type: 'Point',
          coordinates: [parseFloat(lon), parseFloat(lat)],
        },
        lastPing: new Date(),
      },
      { new: true }
    ).populate('department', 'name');

    if (!team) return res.status(404).json({ error: 'Team not found or unauthorized' });

    // Emit to supervisors (COC dashboard)
    const io = req.app.get('io');
    if (io) {
      io.to('role:supervisor').emit('team:location', team.toObject());
    }

    res.json(team);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
