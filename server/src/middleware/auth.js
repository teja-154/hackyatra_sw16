// Simple session token auth — checks Authorization: Bearer <token>
// Tokens are generated at login and stored in-memory (good enough for hackathon)

const activeSessions = new Map(); // token → { departmentId, departmentName, expiresAt }

export function createSession(departmentId, departmentName) {
  const token = crypto.randomUUID();
  const expiresAt = Date.now() + 8 * 60 * 60 * 1000; // 8 hours
  activeSessions.set(token, { departmentId, departmentName, expiresAt });
  return { token, expiresAt };
}

export function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authorization header missing' });
  }

  const token = header.slice(7);
  const session = activeSessions.get(token);

  if (!session) {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }

  if (Date.now() > session.expiresAt) {
    activeSessions.delete(token);
    return res.status(401).json({ error: 'Session expired — please log in again' });
  }

  req.departmentId   = session.departmentId;
  req.departmentName = session.departmentName;
  next();
}

export function invalidateSession(token) {
  activeSessions.delete(token);
}
