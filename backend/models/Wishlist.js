/**
 * models/Wishlist.js — one saved-products list per authenticated user (Phase 6).
 *
 *   Wishlist ── user (unique ref → User)
 *            └─ products[] (refs → Product)
 *
 * References only — product details are populated at read time. Uniqueness of
 * each entry is enforced by the controller (MongoDB does not dedupe arrays by
 * itself), so a product can never appear twice.
 */
'use strict';

const mongoose = require('mongoose');

const wishlistSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    products: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
      },
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.model('Wishlist', wishlistSchema);
