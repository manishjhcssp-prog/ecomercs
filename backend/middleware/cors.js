/**
 * middleware/cors.js — minimal CORS for local development (Phase 3).
 *
 * The static frontend (dev-server.js) runs on http://127.0.0.1:5500 while the
 * API runs on :5000, so browsers need an explicit cross-origin allowance.
 *
 * Only the exact frontend origins below are allowed — no wildcard — and extra
 * origins can be added via CLIENT_ORIGIN (comma-separated) without code edits.
 */
'use strict';

const ALWAYS_ALLOWED = ['http://localhost:5500', 'http://127.0.0.1:5500'];

function allowedOrigins() {
  const extra = (process.env.CLIENT_ORIGIN || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  return new Set([...ALWAYS_ALLOWED, ...extra]);
}

function cors(req, res, next) {
  const origin = req.headers.origin;

  if (origin && allowedOrigins().has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Max-Age', '600'); // cache preflights 10 min
  }

  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  return next();
}

module.exports = cors;
