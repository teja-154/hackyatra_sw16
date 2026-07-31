import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import Signal from '../models/Signal.js';
import { classifyIssue, CATEGORY_DEPT_MAP } from '../services/aiClassifier.js';
import { correlateSignal } from '../services/correlationEngine.js';
import { complaintsLimiter } from '../middleware/rateLimiter.js';

const router = Router();

const VALID_WARDS = [
  'Ward 1 - Gajuwaka', 'Ward 5 - MVP Colony', 'Ward 8 - Seethammadhara',
  'Ward 12 - Dwaraka Nagar', 'Ward 18 - Maddilapalem', 'Ward 22 - Akkayyapalem',
  'Ward 30 - Pendurthi', 'Ward 35 - Simhachalam',
];

/**
 * POST /api/complaints
 * Citizen submits a complaint. Pipeline:
 * validate → AI classify → store signal → correlate → respond
 */
router.post('/', complaintsLimiter, async (req, res) => {
  try {
    const { description, photo_url, lat, lon, ward, idempotency_key, phone } = req.body;

    // ── Validation ────────────────────────────────────────
    if (!description || description.trim().length < 5) {
      return res.status(400).json({ error: 'Description must be at least 5 characters' });
    }
    if (lat == null || lon == null) {
      return res.status(400).json({ error: 'Location (lat/lon) is required' });
    }
    if (!ward) {
      return res.status(400).json({ error: 'Ward is required' });
    }
    if (!VALID_WARDS.includes(ward)) {
      return res.status(400).json({ error: 'Invalid ward. Please select a valid ward.' });
    }

    // Phone number — MANDATORY, must be exactly 10 digits
    if (!phone) {
      return res.status(400).json({ error: 'Phone number is required' });
    }
    const phoneClean = String(phone).replace(/\D/g, '');
    if (phoneClean.length !== 10) {
      return res.status(400).json({ error: 'Phone number must be exactly 10 digits' });
    }

    // ── Idempotency check ─────────────────────────────────
    if (idempotency_key) {
      const existing = await Signal.findOne({ idempotencyKey: idempotency_key }).populate('incident');
      if (existing) {
        return res.status(201).json({
          id: existing.incident?._id || existing._id,
          signal_id: existing._id,
          status: existing.incident?.status || 'reported',
          category: existing.category,
          department: existing.incident?.department || 'GVMC General',
          urgency: existing.incident?.urgency || 'medium',
          duplicate: true,
        });
      }
    }

    // ── AI Classification ─────────────────────────────────
    const aiResult = await classifyIssue(photo_url, description);

    // ── Create signal ─────────────────────────────────────
    const signal = await Signal.create({
      idempotencyKey: idempotency_key || uuidv4(),
      source: 'citizen',
      description: description.trim(),
      photoUrl: photo_url,
      location: {
        type: 'Point',
        coordinates: [parseFloat(lon), parseFloat(lat)],
      },
      ward,
      category: aiResult.category,
      confidence: aiResult.confidence,
      aiFailed: aiResult.aiFailed,
      phone: phoneClean,
    });

    // Attach department name for correlation engine
    signal.departmentName = aiResult.department;
    signal.urgency = aiResult.urgency;

    // ── Correlation — merge or create incident ────────────
    const incident = await correlateSignal(signal);

    res.status(201).json({
      id: incident._id,
      signal_id: signal._id,
      status: incident.status,
      category: aiResult.category,
      department: aiResult.department,
      urgency: aiResult.urgency,
      confidence: aiResult.confidence,
      ai_failed: aiResult.aiFailed,
      occurrence_count: incident.occurrenceCount,
      sources: incident.sources,
      assigned_team: incident.assignedTeam?.name || null,
    });
  } catch (err) {
    console.error('Complaint error:', err.message);
    res.status(500).json({ error: 'Failed to process complaint' });
  }
});

export default router;
