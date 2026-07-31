import { Router } from 'express';
import bcrypt from 'bcryptjs';
import Department from '../models/Department.js';
import { createSession, invalidateSession } from '../middleware/auth.js';

const router = Router();

/**
 * POST /api/auth/login
 * Department code + PIN → session token
 */
router.post('/login', async (req, res) => {
  try {
    const { code, pin } = req.body;

    if (!code || !pin) {
      return res.status(400).json({ error: 'Department code and PIN are required' });
    }

    const dept = await Department.findOne({ code: code.toUpperCase() });
    if (!dept) {
      return res.status(401).json({ error: 'Invalid department code' });
    }

    const valid = await bcrypt.compare(pin, dept.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid PIN' });
    }

    const { token, expiresAt } = createSession(dept._id.toString(), dept.name);

    res.json({
      token,
      expiresAt,
      department: {
        id: dept._id,
        name: dept.name,
        code: dept.code,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** POST /api/auth/logout */
router.post('/logout', (req, res) => {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    invalidateSession(header.slice(7));
  }
  res.json({ message: 'Logged out' });
});

/** GET /api/auth/departments — public list for login dropdown */
router.get('/departments', async (_req, res) => {
  try {
    const depts = await Department.find({}, 'name code').sort({ name: 1 });
    res.json(depts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
