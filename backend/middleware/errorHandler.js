/**
 * middleware/errorHandler.js — centralized API error handling (Phase 3).
 *
 * - Unknown routes get a clean JSON 404 (no HTML error pages).
 * - All thrown/next()'d errors end in one handler: consistent JSON shape,
 *   server-side logging, and NO stack traces outside development.
 */
'use strict';

/** 404 for unmatched routes — mounted after the API router. */
function notFoundHandler(req, res) {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
}

/** Central error handler — must have 4 args so Express recognizes it. */
function errorHandler(err, req, res, _next) {
  // Body-parser JSON syntax errors arrive here too.
  let status = err.statusCode || err.status || 500;
  let message = err.message || 'Internal server error';
  if (err.type === 'entity.parse.failed') {
    status = 400;
    message = 'Invalid JSON payload.';
  } else if (err.name === 'ValidationError') {
    // Mongoose validation: surface the human-readable field messages as 400.
    status = 400;
    message =
      Object.values(err.errors || {})
        .map((e) => e.message)
        .join(' ') || 'Validation failed';
  } else if (err.name === 'CastError') {
    status = 400;
    message = `Invalid value for "${err.path}".`;
  }

  if (status >= 500) {
    console.error('[error]', err.stack || err.message);
  }

  const isProduction = process.env.NODE_ENV === 'production';
  if (status >= 500 && isProduction) {
    // Phase 11: internal error details (driver messages etc.) never leave the
    // process in production — clients get a generic safe message.
    message = 'Internal server error';
  }
  res.status(status).json({
    success: false,
    message,
    ...(isProduction ? {} : { error: err.type || err.name }),
  });
}

module.exports = { notFoundHandler, errorHandler };
