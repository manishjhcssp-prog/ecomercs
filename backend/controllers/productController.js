/**
 * controllers/productController.js — Product CRUD + catalog queries (Phase 4).
 *
 * Flow: Route → Controller → Model → MongoDB. No DB logic in route files.
 *
 * Response convention (consistent across the product system):
 *   success: { success: true, data: ..., [pagination] }
 *   error:   { success: false, message: "..." }   (shaped by errorHandler)
 */
'use strict';

const mongoose = require('mongoose');
const Product = require('../models/Product');
const asyncHandler = require('../utils/asyncHandler');

/** Escapes user text before embedding it in a RegExp. */
function escapeRegex(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function fail(message, statusCode = 400) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

/** The whole API depends on MongoDB; make an unreachable DB explicit (503). */
function requireDB() {
  if (mongoose.connection.readyState !== 1) {
    throw fail('Database not connected — set MONGODB_URI in backend/.env and restart the server.', 503);
  }
}

/**
 * GET /api/products
 * Query: search, category, minPrice, maxPrice, rating (min 1..5),
 *        inStock ('1'|'true'), sale ('1'|'true'),
 *        sort(newest|price_asc|price_desc|rating|featured), page, limit
 * Soft-deleted products (isActive:false) are never listed.
 *
 * Phase 10: rating / availability / sale filtering moved SERVER-SIDE so they
 * compose correctly with pagination (previously client-side over one page).
 */
exports.getProducts = asyncHandler(async (req, res) => {
  requireDB();

  const { search, category, minPrice, maxPrice, sort } = req.query;
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 12));

  const filter = { isActive: true };

  if (search && String(search).trim()) {
    // Cap length; escape regex specials; cover name/description/brand/category.
    const term = String(search).trim().slice(0, 100);
    const rx = new RegExp(escapeRegex(term), 'i');
    filter.$or = [
      { name: rx },
      { description: rx },
      { brand: rx },
      { category: rx },
    ];
  }

  if (category && String(category).trim()) {
    // Comma-separated multi-select, each exact + case-insensitive.
    const cats = String(category)
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean)
      .slice(0, 10)
      .map((c) => new RegExp(`^${escapeRegex(c)}$`, 'i'));
    if (cats.length === 1) filter.category = cats[0];
    else if (cats.length > 1) filter.category = { $in: cats };
  }

  const price = {};
  if (minPrice !== undefined && String(minPrice).trim() !== '') {
    const n = Number(minPrice);
    if (Number.isNaN(n) || n < 0) throw fail('minPrice must be a non-negative number');
    price.$gte = n;
  }
  if (maxPrice !== undefined && String(maxPrice).trim() !== '') {
    const n = Number(maxPrice);
    if (Number.isNaN(n) || n < 0) throw fail('maxPrice must be a non-negative number');
    price.$lte = n;
  }
  if (Object.keys(price).length) filter.price = price;

  /* Minimum rating filter — stored average is APPROVED-reviews-only (Phase 10).
     Accept whole stars 1..5 ("4★ & up"); ignore everything else. */
  if (req.query.rating !== undefined && String(req.query.rating).trim() !== '') {
    const n = Number(req.query.rating);
    if (!Number.isInteger(n) || n < 1 || n > 5) throw fail('rating must be a whole number between 1 and 5');
    filter.rating = { $gte: n };
  }

  /* Availability: inStock=1 → only products with stock > 0. */
  if (['1', 'true'].includes(String(req.query.inStock).toLowerCase())) {
    filter.stock = { $gt: 0 };
  }

  /* Sale: originalPrice set strictly above current price. */
  if (['1', 'true'].includes(String(req.query.sale).toLowerCase())) {
    filter.originalPrice = { $gt: 0 };
    filter.$expr = { $gt: ['$originalPrice', '$price'] };
  }

  const sortMap = {
    newest: { createdAt: -1 },
    price_asc: { price: 1 },
    price_desc: { price: -1 },
    rating: { rating: -1, numReviews: -1 },
    featured: { isFeatured: -1, createdAt: -1 },
    // NOTE: 'popularity' intentionally NOT implemented — no sold-count metric
    // exists in the data model yet (directive §16 forbids fake metrics).
  };

  const [items, total] = await Promise.all([
    Product.find(filter)
      .sort(sortMap[sort] || sortMap.featured)
      .skip((page - 1) * limit)
      .limit(limit)
      .select('-__v'),
    Product.countDocuments(filter),
  ]);

  res.json({
    success: true,
    data: items,
    pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
  });
});

/**
 * GET /api/products/:id/related — same active category first (by rating then
 * newest); topped up with same-brand matches when the category is thin.
 * Never includes the product itself or inactive/deleted products.
 */
exports.getRelatedProducts = asyncHandler(async (req, res) => {
  requireDB();
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) throw fail('Invalid product id');

  const product = await Product.findById(id).select('category brand isActive');
  if (!product || !product.isActive) throw fail('Product not found', 404);

  const LIMIT = 8;
  const cardFields = 'name brand category price originalPrice images stock rating numReviews isActive';

  const inCategory = await Product.find({
    _id: { $ne: product._id },
    isActive: true,
    category: product.category,
  })
    .sort({ rating: -1, numReviews: -1, createdAt: -1 })
    .limit(LIMIT)
    .select(cardFields);

  let related = inCategory;
  if (related.length < LIMIT && product.brand) {
    const exclude = new Set([String(product._id), ...related.map((r) => String(r._id))]);
    const byBrand = await Product.find({
      _id: { $nin: [...exclude] },
      isActive: true,
      brand: new RegExp(`^${escapeRegex(product.brand)}$`, 'i'),
    })
      .sort({ rating: -1, createdAt: -1 })
      .limit(LIMIT - related.length)
      .select(cardFields);
    related = related.concat(byBrand);
  }

  res.json({ success: true, data: related });
});

/** GET /api/products/:id — invalid id → 400, missing/inactive → 404. */
exports.getProductById = asyncHandler(async (req, res) => {
  requireDB();
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) throw fail('Invalid product id');

  const product = await Product.findById(id).select('-__v');
  if (!product || !product.isActive) throw fail('Product not found', 404);

  res.json({ success: true, data: product });
});

/**
 * POST /api/products — ADMIN ONLY (enforced in routes).
 * Phase 11: rating/numReviews are SYSTEM-MANAGED aggregates (maintained by the
 * review system) — client payloads can never set them, so an admin write can't
 * corrupt or fake the store's rating data.
 */
const SYSTEM_MANAGED_PRODUCT_FIELDS = ['rating', 'numReviews', '_id', '__v'];
function stripSystemFields(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return {};
  const clean = { ...body };
  for (const field of SYSTEM_MANAGED_PRODUCT_FIELDS) delete clean[field];
  return clean;
}

exports.createProduct = asyncHandler(async (req, res) => {
  requireDB();
  const product = await Product.create(stripSystemFields(req.body));
  res.status(201).json({ success: true, data: product });
});

/** PUT /api/products/:id — returns the updated product; validation errors surface as 400. */
exports.updateProduct = asyncHandler(async (req, res) => {
  requireDB();
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) throw fail('Invalid product id');
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
    throw fail('Request body must be a JSON object');
  }

  const product = await Product.findByIdAndUpdate(id, stripSystemFields(req.body), {
    new: true,
    runValidators: true,
  }).select('-__v');

  if (!product) throw fail('Product not found', 404);
  res.json({ success: true, data: product });
});

/**
 * DELETE /api/products/:id — SOFT delete (isActive:false).
 * Data is never destroyed; the product simply disappears from public listings.
 */
exports.deleteProduct = asyncHandler(async (req, res) => {
  requireDB();
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) throw fail('Invalid product id');

  const product = await Product.findByIdAndUpdate(id, { isActive: false }, { new: true }).select('-__v');
  if (!product) throw fail('Product not found', 404);

  res.json({ success: true, message: 'Product deactivated (soft delete)', data: product });
});
