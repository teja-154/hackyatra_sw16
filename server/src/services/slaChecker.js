import cron from 'node-cron';
import Incident from '../models/Incident.js';
import { calculatePriority } from './priorityScorer.js';
import { emitToSupervisors } from './socketManager.js';

/** SLA thresholds in milliseconds */
const SLA_THRESHOLDS = {
  critical: 15 * 60 * 1000,      // 15 min
  high:     60 * 60 * 1000,      // 1 hr
  medium:   4 * 60 * 60 * 1000,  // 4 hr
  low:      24 * 60 * 60 * 1000, // 24 hr
};

/**
 * SLA checker — runs every 5 minutes.
 * Checks all open incidents for SLA breaches, recalculates priority scores.
 */
export async function checkSLA() {
  try {
    const openIncidents = await Incident.find({
      status: { $nin: ['resolved_verified', 'disputed'] },
    });

    for (const incident of openIncidents) {
      const age = Date.now() - new Date(incident.createdAt).getTime();
      const threshold = SLA_THRESHOLDS[incident.urgency] || SLA_THRESHOLDS.medium;

      // Check for SLA breach
      if (age > threshold && !incident.slaBreached) {
        incident.slaBreached = true;
        incident.statusHistory.push({
          status: 'sla_breached',
          changedBy: 'system',
          note: `SLA breached — ${incident.urgency} threshold exceeded`,
          timestamp: new Date(),
        });

        emitToSupervisors('incident:sla_breach', {
          incidentId: incident._id,
          ward: incident.ward,
          category: incident.category,
          urgency: incident.urgency,
          age: Math.round(age / 60000),
        });
      }

      // Recalculate priority (age bonus increases)
      incident.priorityScore = await calculatePriority(incident);
      await incident.save();
    }

    if (openIncidents.length > 0) {
      console.log(`⏰ SLA check: ${openIncidents.length} open incidents reviewed`);
    }
  } catch (err) {
    console.error('SLA checker error:', err.message);
  }
}

export function startSLAChecker() {
  cron.schedule('*/5 * * * *', async () => {
    await checkSLA();
  });

  console.log('⏰ SLA checker started (every 5 min)');
}
