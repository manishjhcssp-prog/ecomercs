/**
 * utils/rateLimiter.js — minimal fixed-window in-memory rate limiter (Phase 11).
 *
 * Why hand-rolled instead of a package: the audit needed protection on a handful
 * of sensitive endpoints (login/register/payments/review-create) for a
 * single-instance Node process. A ~40-line limiter avoids adding a runtime
 * dependency while giving the same practical guarantee for this deployment
 * shape. If the app ever scales horizontally, swap this module's internals for
 * a shared-store implementation (e.g. Redis) — call-sites stay identical.
 *
 * Keyed by client IP (+ optional bucket name). Fixed window counters with lazy
 * expiry; worst-case memory is bounded by unique IPs per window.
 */
'use strict';

/** @type {Map<string, {count:number, resetAt:number}>} */
const buckets = new Map();

// Periodically drop expired buckets so memory stays flat.
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of buckets) {
    if (entry.resetAt <= now) buckets.delete(key);
  }
}, 60_000).unref();

/**
 * Factory: rateLimit({ windowMs, max, message?, keyBy? })
 * Returns Express middleware. Attach PER ROUTE (not globally) so normal
 * browsing is never throttled.
 */
function rateLimit({ windowMs = 15 * 60 * 1000, max = 100, message = 'Too many requests — please try again later.', keyBy = '' } = {}) {
  return function rateLimiter(req, res, next) {
    const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
               req.socket?.remoteAddress || 'unknown';
    const key = `${keyBy}:${ip}`;
    const now = Date.now();

    let entry = buckets.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      buckets.set(key, entry);
    }
    entry.count += 1;

    res.setHeader('RateLimit-Limit', String(max));
    res.setHeader('RateLimit-Remaining', String(Math.max(0, max - entry.count)));
    if (entry.count > max) {
      const retryAfterSec = Math.ceil((entry.resetAt - now) / 1000);
      res.setHeader('Retry-After', String(retryAfterSec));
      return res.status(429).json({ success: false, message });
    }
    return next();
  };
}

module.exports = { rateLimit };
