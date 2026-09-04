/**
 * scripts/promoteAdmin.js — one-off dev utility: create-or-promote an admin user.
 * Usage: node scripts/promoteAdmin.js <email> [password]
 * There is deliberately NO public endpoint that can set role:'admin'.
 */
'use strict';

// Load backend/.env the same way server.js does (native, no dependency).
const path = require('path');
try { process.loadEnvFile(path.join(__dirname, '..', '.env')); } catch { /* env vars as-is */ }
process.env.DB_CONNECT_ATTEMPTS = process.env.DB_CONNECT_ATTEMPTS || '1';
const mongoose = require('mongoose');
const User = require('../models/User');
const { connectDB } = require('../config/database');

(async () => {
  const email = String(process.argv[2] || '').toLowerCase();
  const password = process.argv[3];
  if (!email) { console.error('usage: node scripts/promoteAdmin.js <email> [password]'); process.exit(1); }

  await connectDB();

  let user = await User.findOne({ email });
  if (!user) {
    if (!password) { console.error('new user needs a password argument'); process.exit(1); }
    user = await User.create({
      name: 'Store Admin',
      email,
      password, // hashed by the model's pre-save hook
      role: 'admin',
    });
    console.log('created admin user:', user.email);
  } else {
    user.role = 'admin';
    user.isActive = true;
    await user.save();
    console.log('promoted existing user to admin:', user.email);
  }
  await mongoose.disconnect();
})().catch((err) => { console.error(err.message); process.exit(1); });
