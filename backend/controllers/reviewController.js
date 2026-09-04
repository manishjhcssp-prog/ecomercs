/**
 * controllers/reviewController.js — Product reviews & ratings (Phase 10).
 *
 * Endpoints served here:
 *   GET    /api/products/:productId/reviews   (public; optionalAuth personalizes)
 *   POST   /api/products/:productId/reviews   (protect)
 *   PUT    /api/reviews/:reviewId             (protect — owner only)
 *   DELETE /api/reviews/:reviewId             (protect — owner only)
 * plus recomputeProductRating(), shared with the admin moderation handlers.
 *
 * Moderation policy: creates/edits start isApproved:false. Only approved
 * reviews are public and counted in the product's rating summary.
 */
'use strict';

const mongoose = require('mongoose');
const Review = require('../models/Review');
const Product = require('../models/Product');
const Order = require('../models/Order');
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

function requireDB() {
  if (mongoose.connection.readyState !== 1) {
    throw fail('Database not connected — set MONGODB_URI in backend/.env and restart the server.', 503);
  }
}

/**
 * Recompute Product.rating (avg of APPROVED reviews, 1 decimal) and
 * .numReviews from real data. Called after every mutation that can change
 * the approved set. Never trusts client numbers.
 */
async function recomputeProductRating(productId) {
  const [agg] = await Review.aggregate([
    { $match: { product: new mongoose.Types.ObjectId(String(productId)), isApproved: true } },
    { $group: { _id: '$product', avg: { $avg: '$rating' }, count: { $sum: 1 } } },
  ]);
  const rating = agg ? Math.round(agg.avg * 10) / 10 : 0;
  const numReviews = agg ? agg.count : 0;
  await Product.findByIdAndUpdate(productId, { rating, numReviews });
  return { rating, numReviews };
}

/** True when this user has a non-cancelled order containing this product. */
async function hasVerifiedPurchase(userId, productId) {
  const found = await Order.exists({
    user: userId,
    'items.product': productId,
    orderStatus: { $ne: 'cancelled' },
  });
  return Boolean(found);
}

/** Whitelist + light normalization of client review payloads. */
function extractPayload(body) {
  const out = {};
  if (body.rating !== undefined) {
    const n = Number(body.rating);
    if (!Number.isInteger(n) || n < 1 || n > 5) throw fail('Rating must be a whole number between 1 and 5.');
    out.rating = n;
  }
  if (body.title !== undefined) out.title = String(body.title).trim().slice(0, 100);
  if (body.comment !== undefined) out.comment = String(body.comment).trim();
  return out;
}

/** Shared loader: valid id + existing ACTIVE product, else uniform errors. */
async function loadActiveProduct(productId) {
  if (!mongoose.isValidObjectId(productId)) throw fail('Invalid product id');
  const product = await Product.findById(productId).select('_id name isActive rating numReviews');
  if (!product || !product.isActive) throw fail('Product not found', 404);
  return product;
}

/**
 * GET /api/products/:productId/reviews
 * Public. Approved reviews for everyone; when logged in, the requester's OWN
 * review (even pending) is additionally returned as `myReview`.
 * Also returns rating distribution over the public set + product summary.
 */
exports.getProductReviews = asyncHandler(async (req, res) => {
  requireDB();
  const product = await loadActiveProduct(req.params.productId);

  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 10));
  let sortMode = String(req.query.sort || 'recent');
  if (!['recent', 'helpful_high', 'rating_desc', 'rating_asc'].includes(sortMode)) sortMode = 'recent';
  const sortMap = {
    recent: { createdAt: -1 },
    helpful_high: { verifiedPurchase: -1, createdAt: -1 },
    rating_desc: { rating: -1, createdAt: -1 },
    rating_asc: { rating: 1, createdAt: -1 },
  };

  /* Optional search within reviews (title/comment), regex-safe + length-capped. */
  const filter = { product: product._id, isApproved: true };
  const q = req.query.q !== undefined ? String(req.query.q) : '';
  if (q.trim()) {
    const rx = new RegExp(escapeRegex(q.trim().slice(0, 100)), 'i');
    filter.$or = [{ comment: rx }, { title: rx }];
  }

  const [reviews, total, distribution] = await Promise.all([
    Review.find(filter)
      .sort(sortMap[sortMode])
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('user', 'name')
      .select('user rating title comment verifiedPurchase createdAt updatedAt'),
    Review.countDocuments(filter),
    Review.aggregate([
      { $match: { product: product._id, isApproved: true } },
      { $group: { _id: '$rating', count: { $sum: 1 } } },
      { $project: { _id: 0, rating: '$_id', count: 1 } },
      { $sort: { rating: -1 } },
    ]),
  ]);

  /* The requester's own review — any approval state — for edit/delete UX. */
  let myReview = null;
  if (req.user) {
    const mine = await Review.findOne({ user: req.user._id, product: product._id })
      .select('rating title comment isApproved verifiedPurchase createdAt updatedAt');
    if (mine) myReview = mine;
  }

  res.json({
    success: true,
    data: {
      reviews,
      pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
      distribution,
      summary: { average: product.rating ?? 0, count: product.numReviews ?? 0 },
      myReview,
    },
  });
});

/**
 * POST /api/products/:productId/reviews — one per user per product.
 * Starts PENDING (isApproved:false); verifiedPurchase computed from Orders.
 */
exports.createReview = asyncHandler(async (req, res) => {
  requireDB();
  const product = await loadActiveProduct(req.params.productId);
  const payload = extractPayload(req.body);
  if (payload.rating === undefined) throw fail('Rating is required.');
  if (!payload.comment || payload.comment.length < 3) throw fail('Review text is required (min 3 characters).');

  const dup = await Review.findOne({ user: req.user._id, product: product._id }).select('_id');
  if (dup) throw fail('You have already reviewed this product — you can edit your existing review instead.', 409);

  const verifiedPurchase = await hasVerifiedPurchase(req.user._id, product._id);

  const review = await Review.create({
    user: req.user._id,
    product: product._id,
    rating: payload.rating,
    title: payload.title || '',
    comment: payload.comment,
    isApproved: false, // moderation queue
    verifiedPurchase,
  });

  // Aggregates unchanged (nothing approved yet), but keep them honest anyway.
  await recomputeProductRating(product._id);

  res.status(201).json({
    success: true,
    message: 'Review submitted — it will appear once approved.',
    data: review,
  });
});

/**
 * PUT /api/reviews/:reviewId — owner only (admins use the moderation API).
 * Edits re-enter moderation (isApproved:false) and aggregates are recomputed.
 */
exports.updateReview = asyncHandler(async (req, res) => {
  requireDB();
  if (!mongoose.isValidObjectId(req.params.reviewId)) throw fail('Invalid review id');

  const review = await Review.findById(req.params.reviewId);
  if (!review) throw fail('Review not found', 404);
  if (String(review.user) !== String(req.user._id)) {
    throw fail('You can only edit your own reviews.', 403);
  }

  const payload = extractPayload(req.body);
  if (payload.rating !== undefined) review.rating = payload.rating;
  if (payload.title !== undefined) review.title = payload.title;
  if (payload.comment !== undefined) {
    if (!payload.comment || payload.comment.length < 3) throw fail('Review text is required (min 3 characters).');
    review.comment = payload.comment;
  }
  review.isApproved = false; // edited content must be re-approved
  await review.save();

  const summary = await recomputeProductRating(review.product);
  res.json({ success: true, message: 'Review updated — pending re-approval.', data: review, meta: { summary } });
});

/**
 * DELETE /api/reviews/:reviewId — owner only via this route (admin route exists).
 */
exports.deleteReview = asyncHandler(async (req, res) => {
  requireDB();
  if (!mongoose.isValidObjectId(req.params.reviewId)) throw fail('Invalid review id');

  const review = await Review.findById(req.params.reviewId);
  if (!review) throw fail('Review not found', 404);
  if (String(review.user) !== String(req.user._id)) {
    throw fail('You can only delete your own reviews.', 403);
  }

  await review.deleteOne();
  const summary = await recomputeProductRating(review.product);
  res.json({ success: true, message: 'Review deleted.', meta: { summary } });
});

/* Shared with adminController (moderation actions also recompute aggregates). */
exports.recomputeProductRating = recomputeProductRating;
