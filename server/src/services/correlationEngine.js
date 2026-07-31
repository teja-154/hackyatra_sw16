import mongoose from 'mongoose';
import Incident from '../models/Incident.js';
import Signal from '../models/Signal.js';
import Department from '../models/Department.js';
import { calculatePriority } from './priorityScorer.js';
import { emitIncidentUpdate } from './socketManager.js';
import { assignNearestTeam } from './teamAssigner.js';
import { CATEGORY_DEPT_MAP } from './aiClassifier.js';

/**
 * Correlation Engine — the core innovation.
 *
 * Rules:
 * 1. SAME ward + same category + open → MERGE (increase occurrenceCount, recalc priority)
 * 2. DIFFERENT ward → always NEW incident (even if same category and nearby)
 * 3. On new incident → immediately auto-assign nearest available team from correct dept (Zomato-style)
 * 4. On merge → recalculate priority (but occurrence bonus is capped, so severity still dominates)
 */
export async function correlateSignal(signal) {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // 1. Search for matching open incident: SAME WARD + SAME CATEGORY
    const existingIncident = await Incident.findOne({
      ward: signal.ward,                               // ← MUST be same ward
      category: signal.category,
      status: { $nin: ['resolved_verified', 'disputed'] },
    }).session(session);

    let incident;

    if (existingIncident) {
      // 2. MERGE — atomic update, boost occurrence count
      incident = await Incident.findByIdAndUpdate(
        existingIncident._id,
        {
          $inc: { occurrenceCount: 1 },
          $addToSet: { sources: signal.source },
          $push: {
            statusHistory: {
              status: 'signal_merged',
              changedBy: signal.source,
              note: `New ${signal.source} report merged (${signal.description.slice(0, 50)}...)`,
              timestamp: new Date(),
            },
          },
        },
        { new: true, session }
      ).populate('department');

      // Recalc
      incident.sourceCount = incident.sources.length;
      incident.priorityScore = await calculatePriority(incident);
      await incident.save({ session });
    } else {
      // 3. CREATE new incident
      const targetDeptName = CATEGORY_DEPT_MAP[signal.category] || signal.departmentName || 'GVMC General';
      const dept = await Department.findOne({
        name: targetDeptName,
      }).session(session);

      incident = new Incident({
        status: 'reported',
        category: signal.category,
        department: dept?._id || null,
        ward: signal.ward,
        location: signal.location,
        urgency: signal.urgency || 'medium',
        sources: [signal.source],
        sourceCount: 1,
        occurrenceCount: 1,
        statusHistory: [{
          status: 'reported',
          changedBy: signal.source,
          note: signal.description.slice(0, 100),
          timestamp: new Date(),
        }],
      });

      incident.priorityScore = await calculatePriority(incident);
      await incident.save({ session });

      // 4. AUTO-ASSIGN nearest team immediately (Zomato/Swiggy style)
      try {
        const team = await assignNearestTeam(incident);
        if (team) {
          incident.assignedTeam = team._id;
          incident.status = 'assigned';
          incident.statusHistory.push({
            status: 'assigned',
            changedBy: 'system',
            note: `Auto-assigned to nearest team: ${team.name}`,
            timestamp: new Date(),
          });
          await incident.save({ session });
        }
      } catch (teamErr) {
        // Non-fatal — incident stays as 'reported' if no team available
        console.warn('Auto-assign skipped:', teamErr.message);
      }
    }

    // 5. Link signal to incident
    await Signal.findByIdAndUpdate(signal._id, {
      incident: incident._id,
    }, { session });

    await session.commitTransaction();

    // 6. Populate and emit
    await incident.populate('department');
    await incident.populate('assignedTeam');
    emitIncidentUpdate(incident.toObject(), existingIncident ? 'incident:updated' : 'incident:new');

    return incident;
  } catch (err) {
    await session.abortTransaction();
    console.error('Correlation engine error:', err.message);
    throw err;
  } finally {
    session.endSession();
  }
}
