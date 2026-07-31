import rateLimit from 'express-rate-limit';

// 10 submissions per IP per hour on complaints
export const complaintsLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Rate limit exceeded — try again later' },
});
