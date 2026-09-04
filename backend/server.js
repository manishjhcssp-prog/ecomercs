/**
 * E-Commerce Backend — Entry Point (Phase 3 Foundation)
 *
 * Startup flow:
 *   Load environment (.env) → Connect MongoDB (optional) → Start Express → Listen
 *
 * The API intentionally still starts when MongoDB is not configured or
 * unreachable — /api/health reports the live database status so the gap
 * stays visible instead of crashing the dev server.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const express = require('express');

// Load backend/.env without an extra dependency (Node >= 20.12).
try {
  process.loadEnvFile(path.join(__dirname, '.env'));
} catch {
  // No readable .env file — plain environment variables are used as-is.
}

const cors = require('./middleware/cors');
const helmet = require('helmet');
const apiRoutes = require('./routes');
const { connectDB } = require('./config/database');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');

const app = express();

app.disable('x-powered-by');              // don't advertise the stack
app.use(helmet({
  // API serves JSON only; the storefront is a separate static origin, so the
  // browser-focused CSP is intentionally left off (frontend sets its own policy
  // when it gains a production host). Everything else (HSTS, no-sniff, frame
  // options, referrer policy, etc.) stays on.
  contentSecurityPolicy: false,
}));
app.use(cors);                           // dev-origin allowlist (see middleware/cors.js)
// safe JSON body parsing; rawBody kept aside for webhook signature verification
// (the /api/payments/webhook route re-parses the exact bytes with express.raw).
app.use(express.json({
  limit: '100kb',
  verify: (req, res, buf) => { req.rawBody = buf; },
}));

app.use('/api', apiRoutes);

// Unknown routes get JSON 404s; every error ends in one central handler.
app.use(notFoundHandler);
app.use(errorHandler);

/** Connect DB (best-effort), then listen. */
async function start() {
  const db = await connectDB();

  if (!process.env.JWT_SECRET) {
    console.warn('[api] JWT_SECRET is not set — register/login will fail until it is added to backend/.env.');
  }

  const PORT = Number(process.env.PORT) || 5000;

  const server = app.listen(PORT, () => {
    console.log(`[api] E-commerce API listening on http://localhost:${PORT} (${db.label})`);
    console.log(`[api] Health check: http://localhost:${PORT}/api/health`);
  });

  // Clean shutdown for Ctrl+C and process managers.
  ['SIGINT', 'SIGTERM'].forEach((signal) => {
    process.on(signal, () => {
      console.log(`\n[api] ${signal} received — shutting down...`);
      server.close(() => process.exit(0));
      setTimeout(() => process.exit(0), 3000).unref(); // safety net
    });
  });
}

if (require.main === module) {
  start().catch((err) => {
    console.error('[api] Fatal startup error:', err);
    process.exit(1);
  });
}

module.exports = app; // exported for future tests without auto-listening
