/**
 * controllers/addressController.js — address book on the User model (Phase 7).
 *
 * Reuses User.addresses (subdocuments with their own _id). Every operation is
 * scoped to req.user._id, so a user can never read or modify another user's
 * address.
 *
 * Default-address rule: at most ONE isDefault per user. Setting a new default
 * clears the previous one. A user's FIRST address becomes default automatically.
 * Deleting the default promotes the oldest remaining address.
 */
'use strict';

const mongoose = require('mongoose');
const User = require('../models/User');
const asyncHandler = require('../utils/asyncHandler');

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

/** Whitelist + trim incoming address fields (isDefault handled separately). */
function pickAddressFields(body) {
  const fields = ['fullName', 'phone', 'addressLine1', 'addressLine2', 'city', 'state', 'postalCode', 'country'];
  const out = {};
  fields.forEach((f) => {
    if (body && body[f] !== undefined) out[f] = String(body[f]).trim();
  });
  return out;
}

function serializeAddress(addr) {
  return {
    id: String(addr._id),
    fullName: addr.fullName,
    phone: addr.phone,
    addressLine1: addr.addressLine1,
    addressLine2: addr.addressLine2,
    city: addr.city,
    state: addr.state,
    postalCode: addr.postalCode,
    country: addr.country,
    isDefault: Boolean(addr.isDefault),
  };
}

async function findUserWithAddresses(userId) {
  const user = await User.findById(userId).select('addresses');
  if (!user) throw fail(404, 'User not found.');
  return user;
}

/** GET /api/users/addresses */
exports.listAddresses = asyncHandler(async (req, res) => {
  requireDB();
  const user = await findUserWithAddresses(req.user._id);
  res.json({ success: true, data: user.addresses.map(serializeAddress) });
});

/** POST /api/users/addresses — creates; enforces single default. */
exports.createAddress = asyncHandler(async (req, res) => {
  requireDB();
  const fields = pickAddressFields(req.body);
  if (!fields.fullName || !fields.phone || !fields.addressLine1 || !fields.city || !fields.state || !fields.postalCode) {
    throw fail(400, 'Full name, phone, address line 1, city, state and postal code are required.');
  }

  const user = await findUserWithAddresses(req.user._id);
  const wantDefault = Boolean((req.body || {}).isDefault) || user.addresses.length === 0;

  if (wantDefault) user.addresses.forEach((a) => { a.isDefault = false; });
  const created = user.addresses.push({ ...fields, isDefault: wantDefault });
  await user.save();

  res.status(201).json({
    success: true,
    message: 'Address added.',
    data: serializeAddress(user.addresses[created - 1]),
  });
});

/** PUT /api/users/addresses/:addressId — updates an owned address. */
exports.updateAddress = asyncHandler(async (req, res) => {
  requireDB();
  const { addressId } = req.params;
  if (!mongoose.isValidObjectId(addressId)) throw fail(400, 'Invalid address id.');

  const user = await findUserWithAddresses(req.user._id);
  const address = user.addresses.id(addressId);
  if (!address) throw fail(404, 'Address not found.');

  Object.assign(address, pickAddressFields(req.body));

  if ((req.body || {}).isDefault === true) {
    user.addresses.forEach((a) => { a.isDefault = false; });
    address.isDefault = true;
  }

  /* Never leave the book without a default if it has addresses. */
  if (!user.addresses.some((a) => a.isDefault)) {
    address.isDefault = true;
  }

  await user.save();
  res.json({ success: true, message: 'Address updated.', data: serializeAddress(address) });
});

/** DELETE /api/users/addresses/:addressId — removes; re-assigns default if needed. */
exports.deleteAddress = asyncHandler(async (req, res) => {
  requireDB();
  const { addressId } = req.params;
  if (!mongoose.isValidObjectId(addressId)) throw fail(400, 'Invalid address id.');

  const user = await findUserWithAddresses(req.user._id);
  const address = user.addresses.id(addressId);
  if (!address) throw fail(404, 'Address not found.');

  const wasDefault = address.isDefault;
  address.deleteOne();

  if (wasDefault && user.addresses.length > 0) {
    user.addresses[0].isDefault = true; // promote oldest remaining
  }

  await user.save();
  res.json({ success: true, message: 'Address deleted.' });
});
