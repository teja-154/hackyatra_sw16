import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import Signal from '../models/Signal.js';
import { correlateSignal } from '../services/correlationEngine.js';

const router = Router();

/**
 * POST /api/sensors/cctv
 * Mock endpoint for CCTV camera events.
 */
router.post('/cctv', async (req, res) => {
  try {
    const { camera_id, event_type, description, lat, lon, ward, confidence } = req.body;

    if (!camera_id || !event_type || lat == null || lon == null || !ward) {
      return res.status(400).json({ error: 'Missing required fields for CCTV event' });
    }

    // Map CCTV event_type to category
    let category = 'other';
    if (event_type === 'vehicle_slowdown') category = 'pothole';
    if (event_type === 'crowd_gathering') category = 'garbage'; // Just a mock heuristic
    if (event_type === 'waterlogging') category = 'water';
    if (event_type === 'road_obstruction') category = 'road';

    const signal = await Signal.create({
      idempotencyKey: `cctv-${camera_id}-${Date.now()}`,
      source: 'cctv',
      description: description || `CCTV Alert: ${event_type}`,
      photoUrl: 'https://images.unsplash.com/photo-1555626906-fcf10d6851b4?w=800&auto=format&fit=crop&q=60', // Mock CCTV image
      location: {
        type: 'Point',
        coordinates: [parseFloat(lon), parseFloat(lat)],
      },
      ward,
      category,
      confidence: confidence || 0.85,
    });

    const incident = await correlateSignal(signal);

    res.status(201).json({
      id: incident._id,
      signal_id: signal._id,
      status: incident.status,
      category: category,
      merged_with_existing: incident.occurrenceCount > 1,
    });
  } catch (err) {
    console.error('CCTV sensor error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
