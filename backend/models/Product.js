/**
 * models/Product.js — Product schema (Phase 4).
 *
 * Validation lives here so every write path (API, seed, future admin UI)
 * gets the same rules. Client input is never trusted blindly: Mongoose casts,
 * validates and applies defaults before anything touches MongoDB.
 *
 * "discount" is a virtual — always derived from price/originalPrice, never
 * stored and never accepted from clients.
 */
'use strict';

const mongoose = require('mongoose');

const CATEGORIES = ['Electronics', 'Fashion', 'Beauty', 'Home', 'Accessories', 'Sports'];

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Product name is required'],
      trim: true,
      minlength: [2, 'Product name must be at least 2 characters'],
      maxlength: [200, 'Product name cannot exceed 200 characters'],
    },
    description: {
      type: String,
      required: [true, 'Product description is required'],
      trim: true,
      maxlength: [2000, 'Description cannot exceed 2000 characters'],
    },
    price: {
      type: Number,
      required: [true, 'Price is required'],
      min: [0.01, 'Price must be a positive number'],
    },
    originalPrice: {
      type: Number,
      min: [0.01, 'Original price must be a positive number'],
      default: null,
    },
    brand: { type: String, trim: true, maxlength: 100, default: '' },
    category: {
      type: String,
      required: [true, 'Category is required'],
      enum: { values: CATEGORIES, message: '"{VALUE}" is not an allowed category' },
    },
    /** Image URLs (or data URIs) — real uploads are intentionally out of scope for now. */
    images: { type: [String], default: [] },
    stock: {
      type: Number,
      default: 0,
      min: [0, 'Stock cannot be negative'],
      validate: {
        validator: Number.isInteger,
        message: 'Stock must be a whole number',
      },
    },
    rating: { type: Number, default: 0, min: [0, 'Rating cannot be below 0'], max: [5, 'Rating cannot exceed 5'] },
    numReviews: { type: Number, default: 0, min: [0, 'numReviews cannot be negative'] },
    isFeatured: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true }, // soft-delete flag
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

// Derived discount percentage (0 when there is no valid original price).
productSchema.virtual('discount').get(function () {
  if (!this.originalPrice || this.originalPrice <= this.price) return 0;
  return Math.round(((this.originalPrice - this.price) / this.originalPrice) * 100);
});

module.exports = mongoose.model('Product', productSchema);
