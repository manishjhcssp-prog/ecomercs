/**
 * controllers/authController.js — register / login / me (Phase 5).
 *
 * Security behaviours:
 * - Registration never accepts role/isActive from the body; new users are
 *   always role:"user", isActive:true.
 * - Duplicate email (Mongo 11000) → friendly 409.
 * - Login uses ONE uniform message for unknown email AND wrong password
 *   (prevents account enumeration); deactivated accounts get a distinct 403.
 * - Password hashes never leave the server (schema select:false + toJSON strip).
 */
'use strict';

const mongoose = require('mongoose');
const User = require('../models/User');
const asyncHandler = require('../utils/asyncHandler');
const { generateToken } = require('../utils/jwt');

function fail(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

function requireDB() {
  if (mongoose.connection.readyState !== 1) {
    throw fail(503, 'Database not connected — set MONGODB_URI in backend/.env and restart the server.');
  }
}

/** POST /api/auth/register {name, email, password} → 201 {user, token} */
exports.register = asyncHandler(async (req, res) => {
  requireDB();
  const { name, email, password } = req.body || {};
  if (!name || !email || !password) {
    throw fail(400, 'Name, email and password are required.');
  }

  try {
    const user = await User.create({
      name: String(name).trim(),
      email: String(email).trim().toLowerCase(),
      password: String(password),
    });
    const token = generateToken(user._id);
    res.status(201).json({ success: true, data: { user: user.toJSON(), token } });
  } catch (err) {
    if (err.code === 11000) throw fail(409, 'Email already registered.');
    throw err; // schema validation → 400 via central handler
  }
});

/** POST /api/auth/login {email, password} → 200 {user, token} */
exports.login = asyncHandler(async (req, res) => {
  requireDB();
  const { email, password } = req.body || {};
  if (!email || !password) throw fail(400, 'Email and password are required.');

  const user = await User.findOne({ email: String(email).trim().toLowerCase() }).select('+password');

  // Uniform failure message for "unknown email" and "wrong password".
  if (!user || !(await user.comparePassword(String(password)))) {
    throw fail(401, 'Invalid email or password.');
  }
  if (!user.isActive) throw fail(403, 'Account deactivated. Contact support.');

  const token = generateToken(user._id);
  res.json({ success: true, data: { user: user.toJSON(), token } });
});

/** GET /api/auth/me — protected; returns the token owner's safe profile. */
exports.me = asyncHandler(async (req, res) => {
  res.json({ success: true, data: req.user.toJSON() });
});
