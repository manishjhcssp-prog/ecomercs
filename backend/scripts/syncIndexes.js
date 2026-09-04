/**
 * syncIndexes.js — one-off/maintenance: connect to MongoDB and ensure the
 * Phase-10 indexes exist. Safe to re-run (idempotent).
 * Usage: node scripts/syncIndexes.js
 */
'use strict';
process.loadEnvFile?.('./.env');
const mongoose = require('mongoose');

(async () => {
  if (!process.env.MONGODB_URI) { console.error('MONGODB_URI missing'); process.exit(1); }
  await mongoose.connect(process.env.MONGODB_URI);
  const Product = require('../models/Product');
  const Review = require('../models/Review');
  const Order = require('../models/Order');
  await Promise.all([Product.syncIndexes(), Review.syncIndexes(), Order.syncIndexes()]);
  const colls = mongoose.connection.db;
  for (const name of ['products', 'reviews', 'orders']) {
    const idx = await colls.collection(name).indexes();
    console.log(name + ':');
    for (const i of idx) {
      console.log('  ', JSON.stringify(i.key), i.unique ? '(unique)' : '', i.name === '_id_' ? '' : '— ' + (i.name || ''));
    }
  }
  await mongoose.disconnect();
  console.log('done');
  process.exit(0);
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
