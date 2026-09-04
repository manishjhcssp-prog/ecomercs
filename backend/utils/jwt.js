/**
 * utils/jwt.js — JWT signing/verification (Phase 5).
 *
 * The secret comes ONLY from the environment (backend/.env). Without it the
 * helpers throw a 503-classified error so endpoints fail loudly but safely —
 * a fallback secret would silently weaken every account.
 */
'use strict';

const jwt = require('jsonwebtoken');

function getSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    const err = new Error('JWT_SECRET is not configured — set it in backend/.env.');
    err.statusCode = 503;
    throw err;
  }
  return secret;
}

/** Sign a token for a user id. Expiry: JWT_EXPIRES_IN (default 7d). */
function generateToken(userId) {
  return jwt.sign({ id: String(userId) }, getSecret(), {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
}

/** Verify a token; throws JsonWebTokenError / TokenExpiredError / config 503. */
function verifyToken(token) {
  return jwt.verify(token, getSecret());
}

module.exports = { generateToken, verifyToken };
