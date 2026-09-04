/**
 * controllers/userController.js — protected profile endpoints (Phase 5).
 *
 * Only whitelisted, non-sensitive fields are updatable (name/phone/avatar).
 * Email, password and role are NOT changeable here:
 * - role: privilege escalation guard — admins are made server-side only
 * - email/password: sensitive flows belong to dedicated future endpoints
 */
'use strict';

const User = require('../models/User');
const asyncHandler = require('../utils/asyncHandler');

const UPDATABLE_FIELDS = ['name', 'phone', 'avatar'];

/** GET /api/users/profile — protected. */
exports.getProfile = (req, res) => {
  res.json({ success: true, data: req.user.toJSON() });
};

/** PUT /api/users/profile — protected; whitelisted fields only. */
exports.updateProfile = asyncHandler(async (req, res) => {
  const updates = {};
  UPDATABLE_FIELDS.forEach((field) => {
    if (req.body && req.body[field] !== undefined) updates[field] = req.body[field];
  });

  if (Object.keys(updates).length === 0) {
    const err = new Error('No updatable fields provided (allowed: name, phone, avatar).');
    err.statusCode = 400;
    throw err;
  }

  const user = await User.findByIdAndUpdate(req.user._id, updates, {
    new: true,
    runValidators: true,
  });

  res.json({ success: true, message: 'Profile updated.', data: user.toJSON() });
});
