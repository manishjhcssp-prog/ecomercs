'use strict';

/**
 * api/index.js — Vercel Serverless Function entry point.
 *
 * Routes all /api/* requests to the Express backend application
 * while managing database connection caching across warm serverless invocations.
 */

const app = require('../backend/server');
const { connectDB } = require('../backend/config/database');

let dbPromise = null;

async function ensureDB() {
  if (!dbPromise) {
    dbPromise = connectDB().catch((err) => {
      console.error('[vercel-serverless] MongoDB connection error:', err && err.message);
      dbPromise = null; // Allow retry on subsequent request
    });
  }
  return dbPromise;
}

module.exports = async (req, res) => {
  try {
    await ensureDB();
  } catch (err) {
    console.error('[vercel-serverless] DB init failure:', err);
  }
  return app(req, res);
};
