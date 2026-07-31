import FieldTeam from '../models/FieldTeam.js';

/**
 * Find and assign the nearest available field team for an incident.
 * 
 * Priority order (like Zomato/Swiggy):
 * 1. Same department + same ward + available → best match
 * 2. Same department + nearest ward + available → fallback
 * 3. Any department + same ward + available → cross-dept help
 * 4. null → no team available
 */
export async function assignNearestTeam(incident) {
  if (!incident.department) return null;

  try {
    // Step 1: Same department + same ward
    let team = await FieldTeam.findOneAndUpdate(
      {
        department: incident.department,
        ward: incident.ward,
        status: 'available',
      },
      { status: 'busy' },
      { new: true }
    );

    if (team) {
      console.log(`📍 Team assigned (same ward): ${team.name}`);
      return team;
    }

    // Step 2: Same department + nearest by geo (any ward)
    team = await FieldTeam.findOneAndUpdate(
      {
        department: incident.department,
        status: 'available',
        location: {
          $near: {
            $geometry: {
              type: 'Point',
              coordinates: incident.location.coordinates,
            },
          },
        },
      },
      { status: 'busy' },
      { new: true }
    );

    if (team) {
      console.log(`📍 Team assigned (nearest ward): ${team.name} from ${team.ward}`);
      return team;
    }

    // Step 3: Any department + same ward (cross-department emergency help)
    team = await FieldTeam.findOneAndUpdate(
      {
        ward: incident.ward,
        status: 'available',
      },
      { status: 'busy' },
      { new: true }
    );

    if (team) {
      console.log(`📍 Team assigned (cross-dept): ${team.name}`);
      return team;
    }

    console.warn('⚠️ No available teams for assignment');
    return null;
  } catch (err) {
    console.error('Team assignment failed:', err.message);
    return null;
  }
}
