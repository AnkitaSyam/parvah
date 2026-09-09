/**
 * backend/middleware/security.js
 *
 * Security headers and rate limiting, implemented without new dependencies so
 * that `npm install` against the existing lockfile keeps working offline at a
 * hackathon venue. If you later add `helmet` and `express-rate-limit`, they
 * are drop-in replacements for these two functions.
 */

/**
 * Conservative security headers. The API serves JSON only, so the CSP can be
 * maximally restrictive.
 */
export function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  res.removeHeader('X-Powered-By');
  next();
}

/**
 * Fixed-window in-memory rate limiter.
 *
 * Keyed by authenticated user id where available, falling back to IP. Single
 * process only — behind multiple instances you want Redis, but for this
 * deployment shape it correctly stops one user hammering Groq, Twilio or the
 * upload endpoint.
 *
 * @param {Object} options
 * @param {number} options.windowMs
 * @param {number} options.max
 * @param {string} [options.message]
 */
export function rateLimit({ windowMs, max, message, keyGenerator }) {
  const hits = new Map();

  // Drop expired buckets periodically so the map cannot grow without bound.
  const sweeper = setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of hits) {
      if (bucket.resetAt <= now) hits.delete(key);
    }
  }, Math.max(windowMs, 60_000));

  // Do not hold the event loop open just for the sweeper.
  if (typeof sweeper.unref === 'function') sweeper.unref();

  return function rateLimiter(req, res, next) {
    const key = (typeof keyGenerator === 'function' ? keyGenerator(req) : null)
      || req.user?.id
      || req.ip
      || req.headers['x-forwarded-for']
      || req.socket?.remoteAddress
      || 'unknown';

    const now = Date.now();
    let bucket = hits.get(key);

    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      hits.set(key, bucket);
    }

    bucket.count += 1;

    const remaining = Math.max(0, max - bucket.count);
    res.setHeader('RateLimit-Limit', String(max));
    res.setHeader('RateLimit-Remaining', String(remaining));
    res.setHeader('RateLimit-Reset', String(Math.ceil((bucket.resetAt - now) / 1000)));

    if (bucket.count > max) {
      const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({
        error: 'RATE_LIMITED',
        message: message || `Too many requests. Try again in ${retryAfter} seconds.`
      });
    }

    return next();
  };
}

/**
 * Parses the ALLOWED_ORIGINS env var into a CORS origin checker.
 *
 * The API previously ran with `origin: '*'`, which combined with the
 * unauthenticated /uploads mount meant any website could read patient audio.
 * Defaults to localhost dev origins when the variable is unset.
 */
export function buildCorsOrigin() {
  const configured = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  const allowed = configured.length > 0
    ? configured
    : ['http://localhost:3000', 'http://localhost:5173', 'http://127.0.0.1:3000'];

  return function corsOrigin(origin, callback) {
    // Same-origin requests, curl and mobile webviews send no Origin header.
    if (!origin) return callback(null, true);
    if (allowed.includes('*') || allowed.includes(origin)) return callback(null, true);
    return callback(new Error(`Origin ${origin} is not allowed by ALLOWED_ORIGINS.`));
  };
}
