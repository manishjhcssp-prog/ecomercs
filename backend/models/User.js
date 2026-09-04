/**
 * models/User.js — User schema with secure password storage (Phase 5).
 *
 * Security model:
 * - The password is hashed with bcrypt BEFORE saving (pre-save hook) and is
 *   excluded from queries by default (select:false), so hashes never leak
 *   through careless finds. toJSON also strips it as a second guard.
 * - role is an enum (user|admin); registration never accepts a role — the
 *   default is always "user". Privilege changes happen server-side only.
 * - email is unique + normalized to lowercase; duplicates surface as Mongo
 *   error code 11000 which the controller maps to a friendly 409.
 *
 * Addresses: subdocument structure prepared for checkout (Phase 7). The full
 * address CRUD API is intentionally deferred to keep this phase focused.
 */
'use strict';

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

/** Checkout-ready address structure (managed via /api/users/addresses). */
const addressSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true, trim: true, maxlength: 120 },
    phone: {
      type: String,
      required: true,
      trim: true,
      match: [/^\+?[0-9][0-9\s\-]{7,14}$/, 'Please provide a valid phone number (8–15 digits; spaces/hyphens allowed)'],
    },
    addressLine1: { type: String, required: true, trim: true, maxlength: 200 },
    addressLine2: { type: String, trim: true, maxlength: 200, default: '' },
    city: { type: String, required: true, trim: true, maxlength: 100 },
    state: { type: String, required: true, trim: true, maxlength: 100 },
    postalCode: {
      type: String,
      required: true,
      trim: true,
      match: [/^[A-Za-z0-9][A-Za-z0-9\s\-]{2,9}$/, 'Please provide a valid postal code'],
    },
    country: { type: String, trim: true, maxlength: 100, default: 'India' },
    isDefault: { type: Boolean, default: false },
  },
  { _id: true }
);

function safeToJSON(doc, ret) {
  delete ret.password; // hash must NEVER leave the server
  delete ret.__v;
  ret.id = ret._id;
  return ret;
}

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      minlength: [2, 'Name must be at least 2 characters'],
      maxlength: [80, 'Name cannot exceed 80 characters'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email address'],
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [8, 'Password must be at least 8 characters'],
      select: false, // never returned by queries unless explicitly requested
    },
    phone: { type: String, trim: true, maxlength: 20, default: '' },
    avatar: { type: String, trim: true, default: '' },
    addresses: [addressSchema],
    role: {
      type: String,
      enum: { values: ['user', 'admin'], message: '"{VALUE}" is not a valid role' },
      default: 'user',
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true, toJSON: { transform: safeToJSON }, toObject: { transform: safeToJSON } }
);

/** Hash the password on create/whenever it changes — plain text never stored. */
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (err) {
    next(err);
  }
});

/** Compare a candidate password against the stored hash. */
userSchema.methods.comparePassword = function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

module.exports = mongoose.model('User', userSchema);
