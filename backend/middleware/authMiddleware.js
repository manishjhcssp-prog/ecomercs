/**
 * middleware/authMiddleware.js — JWT authentication & role authorization.
 *
 * protect:
 *   1. Reads "Authorization: Bearer <token>"
 *   2. Verifies the JWT (signature + expiry)
 *   3. Loads the CURRENT user from MongoDB (client-supplied ids are ignored —
 *      identity comes exclusively from the verified token)
 *   4. Attaches req.user; rejects invalid/expired/missing/gone users
 *
 * requireAdmin:
 *   Reusable gate for admin-only routes (admin dashboard arrives later).
 */
'use strict';

const User = require('../models/User');
const { verifyToken } = require('../utils/jwt');

function fail(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

const protect = (req, res, next) => {
  const header = req.headers.authorization || '';

  if (!header.startsWith('Bearer ') || header.length < 8) {
    return res.status(401).json({ success: false, message: 'Not authenticated — missing Bearer token.' });
  }
  const token = header.slice(7).trim();

  let decoded;
  try {
    decoded = verifyToken(token);
  } catch (err) {
    if (err.statusCode === 503) return next(err); // server misconfiguration
    const message = err.name === 'TokenExpiredError'
      ? 'Session expired — please log in again.'
      : 'Invalid authentication token.';
    return res.status(401).json({ success: false, message });
  }

  User.findById(decoded.id)
    .then((user) => {
      if (!user) {
        return res.status(401).json({ success: false, message: 'Account no longer exists.' });
      }
      if (!user.isActive) {
        return res.status(403).json({ success: false, message: 'Account deactivated.' });
      }
      req.user = user;
      return next();
    })
    .catch(next);
};

const requireAdmin = (req, res, next) => {
  if (req.user && req.user.role === 'admin') return next();
  return res.status(403).json({ success: false, message: 'Admin access required.' });
};

/**
 * optionalAuth — like protect, but a missing/invalid token is NOT an error:
 * the request proceeds anonymously (req.user stays undefined). Used where
 * personalization is a bonus, e.g. public review lists that flag the
 * requester's own pending review.
 */
const optionalAuth = (req, res, next) => {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ') || header.length < 8) return next();
  const token = header.slice(7).trim();
  let decoded;
  try {
    decoded = verifyToken(token);
  } catch {
    return next(); // anonymous on any token problem
  }
  User.findById(decoded.id)
    .then((user) => {
      if (user && user.isActive) req.user = user;
      next();
    })
    .catch(() => next()); // DB hiccup → degrade to anonymous
};

module.exports = { protect, requireAdmin, optionalAuth };
