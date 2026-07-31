/** Validate required fields in req.body */
export function requireFields(...fields) {
  return (req, res, next) => {
    const missing = fields.filter((f) => !req.body[f] && req.body[f] !== 0);
    if (missing.length) {
      return res.status(400).json({ error: `Missing required fields: ${missing.join(', ')}` });
    }
    next();
  };
}
