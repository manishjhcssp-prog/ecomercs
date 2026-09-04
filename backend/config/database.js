/**
 * config/database.js — MongoDB/Mongoose connection foundation (Phase 3).
 *
 * Reads MONGODB_URI from the environment. A missing or failing connection is
 * reported clearly and NEVER crashes the server — later phases need the API
 * runnable even while the database is still being set up.
 *
 * Credential safety: log output is redacted so a connection string with an
 * embedded password never reaches the console.
 */
'use strict';

const mongoose = require('mongoose');

/** Masks the "user:password@" part of any URI that ends up in a log line. */
function redact(text) {
  return String(text).replace(/\/\/[^@/\s]*@/, '//***@');
}

/**
 * Connect to MongoDB if MONGODB_URI is set.
 *
 * Retries a few times before giving up: Atlas free-tier clusters and flaky
 * networks (VPN/TLS hiccups) often succeed on a later attempt. After the last
 * attempt the server still starts WITHOUT a database — endpoints respond with
 * clean 503s — and mongoose itself keeps auto-reconnecting if a live
 * connection ever drops.
 * @returns {Promise<{connected: boolean, label: string}>}
 */
async function connectDB() {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    console.warn(
      '[db] MONGODB_URI is not set — running WITHOUT a database. ' +
        'Set it in backend/.env (see backend/.env.example).'
    );
    return { connected: false, label: 'database: not configured' };
  }

  const MAX_ATTEMPTS = Number(process.env.DB_CONNECT_ATTEMPTS) || 5;
  const RETRY_DELAY_MS = Number(process.env.DB_CONNECT_RETRY_MS) || 5000;

  mongoose.set('strictQuery', true);

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      await mongoose.connect(uri, {
        serverSelectionTimeoutMS: 8000, // fail fast instead of hanging startup
      });
      console.log(`[db] Connected to MongoDB "${mongoose.connection.name}" at ${mongoose.connection.host}`);
      return { connected: true, label: 'database: connected' };
    } catch (err) {
      console.error(`[db] MongoDB connection failed (attempt ${attempt}/${MAX_ATTEMPTS}): ${redact(err.message)}`);
      if (attempt < MAX_ATTEMPTS) {
        console.warn(`[db] Retrying in ${RETRY_DELAY_MS / 1000}s...`);
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      }
    }
  }

  console.warn('[db] Server will continue WITHOUT a database connection.');
  return { connected: false, label: 'database: unavailable' };
}

/** Human-readable current connection state, used by /api/health. */
function dbStateLabel() {
  const states = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting',
  };
  return states[mongoose.connection.readyState] || 'unknown';
}

// Surface later runtime issues without leaking credentials.
mongoose.connection.on('error', (err) => {
  console.error(`[db] MongoDB error: ${redact(err.message)}`);
});
mongoose.connection.on('disconnected', () => {
  console.warn('[db] MongoDB disconnected.');
});

module.exports = { connectDB, dbStateLabel };
