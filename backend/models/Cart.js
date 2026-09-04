/**
 * models/Cart.js — one persistent cart per authenticated user (Phase 6).
 *
 * Shape follows the spec exactly:
 *   Cart ── user (unique ref → User)
 *        └─ items[] ── product (ref → Product), quantity
 *
 * Product data is NEVER duplicated here — the API populates live name/price/
 * images/stock on read, so price changes reflect instantly and checkout can
 * recalculate authoritatively later.
 *
 * Quantity guards: integer ≥ 1. Removal happens through dedicated endpoints,
 * never by storing a zero.
 */
'use strict';

const mongoose = require('mongoose');

const cartItemSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: [1, 'Quantity must be at least 1'],
      max: [999, 'Quantity cannot exceed 999'],
      validate: {
        validator: Number.isInteger,
        message: 'Quantity must be a whole number',
      },
    },
  },
  { _id: false }
);

const cartSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true, // exactly one cart document per user
    },
    items: {
      type: [cartItemSchema],
      default: [],
    },
  },
  { timestamps: true, toJSON: { virtuals: false } }
);

module.exports = mongoose.model('Cart', cartSchema);
