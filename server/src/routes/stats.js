import { Router } from 'express';
import Incident from '../models/Incident.js';
import Department from '../models/Department.js';

const router = Router();

/** GET /api/stats — ward summaries, dept leaderboard, response times */
router.get('/', async (_req, res) => {
  try {
    // Ward summary — open vs resolved per ward
    const wardStats = await Incident.aggregate([
      {
        $group: {
          _id: '$ward',
          total: { $sum: 1 },
          open: {
            $sum: {
              $cond: [
                { $in: ['$status', ['resolved_verified', 'disputed']] },
                0,
                1,
              ],
            },
          },
          resolved: {
            $sum: {
              $cond: [{ $eq: ['$status', 'resolved_verified'] }, 1, 0],
            },
          },
          avgPriority: { $avg: '$priorityScore' },
          critical: {
            $sum: { $cond: [{ $eq: ['$urgency', 'critical'] }, 1, 0] },
          },
        },
      },
      { $sort: { open: -1 } },
    ]);

    // Department leaderboard — avg resolution time
    const deptStats = await Incident.aggregate([
      { $match: { status: 'resolved_verified', resolvedAt: { $ne: null } } },
      {
        $group: {
          _id: '$department',
          resolved: { $sum: 1 },
          avgResolutionMs: {
            $avg: { $subtract: ['$resolvedAt', '$createdAt'] },
          },
        },
      },
      {
        $lookup: {
          from: 'departments',
          localField: '_id',
          foreignField: '_id',
          as: 'dept',
        },
      },
      { $unwind: { path: '$dept', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          department: '$dept.name',
          resolved: 1,
          avgResolutionMin: { $divide: ['$avgResolutionMs', 60000] },
        },
      },
      { $sort: { avgResolutionMin: 1 } },
    ]);

    // Overall stats
    const total = await Incident.countDocuments();
    const open = await Incident.countDocuments({
      status: { $nin: ['resolved_verified', 'disputed'] },
    });
    const slaBreached = await Incident.countDocuments({ slaBreached: true });

    res.json({
      wards: wardStats,
      departments: deptStats,
      overall: { total, open, resolved: total - open, slaBreached },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
