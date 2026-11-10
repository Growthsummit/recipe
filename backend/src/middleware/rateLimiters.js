import rateLimit from 'express-rate-limit';

const json = (message) => ({
  success: false,
  error: { message, code: 'RATE_LIMITED' },
});

/** Strict limiter for sign-in / sign-up: blunts credential stuffing. */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: json('Too many authentication attempts. Please try again in a few minutes.'),
});

/** General limiter applied to the whole API surface. */
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: json('Too many requests. Please slow down.'),
});

/** Limiter for content creation (recipes, reviews). */
export const writeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: json('Too many write requests. Please slow down.'),
});
