/**
 * controllers/wishlistController.js — authenticated wishlist (Phase 6).
 *
 * Every query is scoped to req.user._id. Products are referenced, never
 * duplicated; reads populate live name/price/images/stock and silently prune
 * references whose product has been deleted or soft-deleted.
 *
 * Duplicate protection: adding an existing product is a no-op that answers
 * 200 "Already in wishlist." — a product can never appear twice.
 */
'use strict';

const mongoose = require('mongoose');
const Wishlist = require('../models/Wishlist');
const Product = require('../models/Product');
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

async function getOrCreateWishlist(userId) {
  return Wishlist.findOneAndUpdate(
    { user: userId },
    { $setOnInsert: { user: userId } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

/** Populate product info; prune deleted/inactive refs from DB and result. */
async function loadFreshWishlist(userId) {
  const wishlist = await getOrCreateWishlist(userId);
  const populated = await wishlist.populate({
    path: 'products',
    select: 'name price images stock isActive',
  });

  const staleIds = populated.products
    .filter((p) => !p || p.isActive === false)
    .map((p) => p && p._id);

  if (staleIds.length > 0) {
    await Wishlist.updateOne({ user: userId }, { $pull: { products: { $in: staleIds } } });
    populated.products = populated.products.filter((p) => p && p.isActive !== false);
  }

  return populated;
}

function serializeWishlist(wishlist) {
  const products = wishlist.products.map((p) => ({
    id: String(p._id),
    name: p.name,
    price: Number(p.price),
    image: Array.isArray(p.images) && p.images[0] ? p.images[0] : '',
    stock: Number(p.stock),
  }));
  return { products };
}

async function respondWithWishlist(res, userId) {
  const wishlist = await loadFreshWishlist(userId);
  res.json({ success: true, data: serializeWishlist(wishlist) });
}

/** GET /api/wishlist */
exports.getWishlist = asyncHandler(async (req, res) => {
  requireDB();
  await respondWithWishlist(res, req.user._id);
});

/** POST /api/wishlist/:productId — adds once; duplicates are a friendly no-op. */
exports.addProduct = asyncHandler(async (req, res) => {
  requireDB();
  const { productId } = req.params;
  if (!mongoose.isValidObjectId(productId)) throw fail(400, 'Invalid product id.');

  const product = await Product.findOne({ _id: productId, isActive: true }).select('_id');
  if (!product) throw fail(404, 'Product not found.');

  const wishlist = await getOrCreateWishlist(req.user._id);
  if (wishlist.products.some((id) => String(id) === String(productId))) {
    const fresh = await loadFreshWishlist(req.user._id);
    return res.json({ success: true, message: 'Already in wishlist.', data: serializeWishlist(fresh) });
  }

  wishlist.products.push(productId);
  await wishlist.save();
  const fresh = await loadFreshWishlist(req.user._id);
  res.status(201).json({ success: true, message: 'Saved to wishlist.', data: serializeWishlist(fresh) });
});

/** DELETE /api/wishlist/:productId — removes one; absent → 404. */
exports.removeProduct = asyncHandler(async (req, res) => {
  requireDB();
  const { productId } = req.params;
  if (!mongoose.isValidObjectId(productId)) throw fail(400, 'Invalid product id.');

  const wishlist = await getOrCreateWishlist(req.user._id);
  const before = wishlist.products.length;
  wishlist.products = wishlist.products.filter((id) => String(id) !== String(productId));
  if (wishlist.products.length === before) throw fail(404, 'Product not found in wishlist.');

  await wishlist.save();
  const fresh = await loadFreshWishlist(req.user._id);
  res.json({ success: true, message: 'Removed from wishlist.', data: serializeWishlist(fresh) });
});

/** DELETE /api/wishlist — clears every saved product for this user. */
exports.clearWishlist = asyncHandler(async (req, res) => {
  requireDB();
  const wishlist = await getOrCreateWishlist(req.user._id);
  wishlist.products = [];
  await wishlist.save();
  const fresh = await loadFreshWishlist(req.user._id);
  res.json({ success: true, message: 'Wishlist cleared.', data: serializeWishlist(fresh) });
});
