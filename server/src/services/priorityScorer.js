import SensitiveZone from '../models/SensitiveZone.js';

/**
 * Category SEVERITY weights — these represent inherent danger/impact.
 * An accident is ALWAYS more severe than a power outage,
 * regardless of how many people report the power outage.
 * 
 * Scale: 0–20 (dominates the score)
 */
const CATEGORY_SEVERITY = {
  crime:      20,   // Life-threatening
  security:   20,
  medical:    18,   // Health emergency
  water:      12,   // Contamination/flooding risk
  drainage:   12,
  electrical: 10,   // Fire/shock hazard
  pothole:    6,    // Vehicle damage, injury risk
  road:       6,
  garbage:    4,    // Hygiene issue
  waste:      4,
};

/** Urgency weights (AI-determined or manual) */
const URGENCY_WEIGHT = {
  low: 0, medium: 3, high: 8, critical: 15,
};

/**
 * Calculate priority score for an incident.
 *
 * FORMULA (designed so severity always wins over report count):
 *
 * priority_score =
 *   category_severity        (0–20, dominates)
 *   + urgency_weight          (0–15)
 *   + occurrence_bonus        (capped at +6, so 3 extra reports max = +6)
 *   + age_bonus               (+1 per 20 min, capped at +8)
 *   + sensitive_zone_bonus    (+5 if near school/hospital)
 *
 * Example:
 *   Accident (crime=20) + 1 report = 20 + 15(critical) = 35
 *   Electricity (electrical=10) + 50 reports = 10 + 8(high) + 6(cap) = 24
 *   → Accident ALWAYS ranks higher even with fewer reports.
 */
export async function calculatePriority(incident) {
  let score = 0;

  // 1. Category severity (dominant factor)
  score += CATEGORY_SEVERITY[incident.category] || 2;

  // 2. Urgency weight
  score += URGENCY_WEIGHT[incident.urgency] || 0;

  // 3. Occurrence bonus — +2 per extra report, CAPPED at +6
  //    This means report volume can never overpower a higher-severity category.
  const occurrenceBonus = Math.min(6, (incident.occurrenceCount - 1) * 2);
  score += occurrenceBonus || 0;

  // 4. Age bonus — +1 per 20 min unresolved, capped at +8
  const createdAtMs = incident.createdAt ? new Date(incident.createdAt).getTime() : Date.now();
  const ageMs = Date.now() - createdAtMs;
  const ageBonus = Math.min(8, Math.floor(ageMs / (20 * 60 * 1000)));
  score += ageBonus || 0;

  // 5. Sensitive zone bonus — +5 if within 150m of school/hospital
  try {
    if (incident.location?.coordinates) {
      const nearbyZone = await SensitiveZone.findOne({
        location: {
          $near: {
            $geometry: {
              type: 'Point',
              coordinates: incident.location.coordinates,
            },
            $maxDistance: 150,
          },
        },
      });
      if (nearbyZone) score += 5;
    }
  } catch {
    // Ignore — zone check is best-effort
  }

  return score;
}

export { CATEGORY_SEVERITY, URGENCY_WEIGHT };
