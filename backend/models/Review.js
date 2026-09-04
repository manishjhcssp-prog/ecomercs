/**
 * models/Review.js — Product reviews & ratings (Phase 10).
 *
 * Rules enforced HERE (schema level):
 *  - rating is a whole number 1..5 (0 / 6 / -1 / 10 are structurally impossible)
 *  - ONE review per (user, product): unique compound index — duplicates are
 *    rejected by MongoDB itself, not just by controller checks
 *  - comment is required and length-bounded; title optional but bounded
 *
 * Moderation policy (Phase 10 decision, recorded in agent_memory.md):
 *  - every new/edited review starts with isApproved:false (pending)
 *  - only APPROVED reviews are public and count toward Product.rating/numReviews
 *  - admins approve/hide via /api/admin/reviews/:id/status
 *
 * verifiedPurchase is COMPUTED server-side at create/edit time from the Order
 * collection; clients can never set it.
 */
'use strict';

const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Review must belong to a user'],
    },
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: [true, 'Review must reference a product'],
    },
    rating: {
      type: Number,
      required: [true, 'Rating is required'],
      min: [1, 'Rating must be between 1 and 5'],
      max: [5, 'Rating must be between 1 and 5'],
      validate: {
        validator: Number.isInteger,
        message: 'Rating must be a whole number between 1 and 5',
      },
    },
    title: {
      type: String,
      trim: true,
      maxlength: [100, 'Title cannot exceed 100 characters'],
      default: '',
    },
    comment: {
      type: String,
      required: [true, 'Review text is required'],
      trim: true,
      minlength: [3, 'Review must be at least 3 characters'],
      maxlength: [1000, 'Review cannot exceed 1000 characters'],
    },
    isApproved: { type: Boolean, default: false }, // moderation gate
    verifiedPurchase: { type: Boolean, default: false }, // server-computed
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: false,
      transform(_doc, ret) {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

/* One review per user per product — DB-level guarantee. */
reviewSchema.index({ user: 1, product: 1 }, { unique: true });

/* Public listing per product (approved first by recency). */
reviewSchema.index({ product: 1, isApproved: 1, createdAt: -1 });

/* Admin queue: moderation backlog oldest-first. */
reviewSchema.index({ isApproved: 1, createdAt: 1 });

module.exports = mongoose.model('Review', reviewSchema);
