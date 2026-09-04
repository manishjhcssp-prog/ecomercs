/**
 * controllers/cartController.js — authenticated cart operations (Phase 6).
 *
 * All handlers run behind `protect`, so req.user is the verified owner and
 * every query is scoped to req.user._id — a user can never touch another
 * user's cart.
 *
 * Response convention (consistent with products/auth):
 *   GET/POST/PUT/DELETE → { success, data: { items, itemCount, subtotal } }
 * where each item is { product: {id,name,price,image,stock}, quantity }.
 * Totals are computed SERVER-side from live product prices; the frontend's
 * delivery/discount display is cosmetic until checkout recalculates.
 *
 * Stock rules (spec §13): requested quantity ≤ product.stock; stock is never
 * decremented here — reservation belongs to the future checkout/order phase.
 */
'use strict';

const mongoose = require('mongoose');
const Cart = require('../models/Cart');
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

function validObjectId(id) {
  return mongoose.isValidObjectId(id);
}

/** Get the user's cart, creating an empty one on first access. */
async function getOrCreateCart(userId) {
  return Cart.findOneAndUpdate(
    { user: userId },
    { $setOnInsert: { user: userId } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

/** Load cart with product data, prune lines whose product is gone/inactive. */
async function loadFreshCart(userId) {
  const cart = await getOrCreateCart(userId);
  const populated = await cart.populate({
    path: 'items.product',
    select: 'name price images stock isActive',
  });

  const staleIds = populated.items
    .filter((line) => !line.product || line.product.isActive === false)
    .map((line) => line.product && line.product._id);

  if (staleIds.length > 0) {
    await Cart.updateOne({ user: userId }, { $pull: { items: { product: { $in: staleIds } } } });
    populated.items = populated.items.filter(
      (line) => line.product && line.product.isActive !== false
    );
  }

  return populated;
}

/** Shape the response payload (frontend-friendly product projection). */
function serializeCart(cart) {
  const items = cart.items.map((line) => ({
    product: {
      id: String(line.product._id),
      name: line.product.name,
      price: Number(line.product.price),
      image: Array.isArray(line.product.images) && line.product.images[0] ? line.product.images[0] : '',
      stock: Number(line.product.stock),
    },
    quantity: line.quantity,
  }));
  const itemCount = items.reduce((sum, line) => sum + line.quantity, 0);
  const subtotal =
    Math.round(items.reduce((sum, line) => sum + line.product.price * line.quantity, 0) * 100) / 100;
  return { items, itemCount, subtotal };
}

async function respondWithCart(res, userId, statusCode = 200) {
  const cart = await loadFreshCart(userId);
  res.status(statusCode).json({ success: true, data: serializeCart(cart) });
}

/** GET /api/cart */
exports.getCart = asyncHandler(async (req, res) => {
  requireDB();
  await respondWithCart(res, req.user._id);
});

/** POST /api/cart/items {productId, quantity?} — adds or increases quantity. */
exports.addItem = asyncHandler(async (req, res) => {
  requireDB();
  const { productId } = req.body || {};
  const quantity = req.body && req.body.quantity !== undefined ? Number(req.body.quantity) : 1;

  if (!validObjectId(productId)) throw fail(400, 'Invalid product id.');
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw fail(400, 'Quantity must be a whole number of at least 1.');
  }

  const product = await Product.findOne({ _id: productId, isActive: true }).select('stock name');
  if (!product) throw fail(404, 'Product not found.');
  if (product.stock <= 0) throw fail(400, `"${product.name}" is out of stock.`);

  const cart = await getOrCreateCart(req.user._id);
  const existing = cart.items.find((line) => String(line.product) === String(productId));
  const currentQty = existing ? existing.quantity : 0;
  if (currentQty + quantity > product.stock) {
    throw fail(400, `Only ${product.stock} unit(s) of "${product.name}" in stock (you already have ${currentQty} in your cart).`);
  }

  if (existing) existing.quantity += quantity;
  else cart.items.push({ product: productId, quantity });

  await cart.save();
  await respondWithCart(res, req.user._id, 201);
});

/** PUT /api/cart/items/:productId {quantity} — sets an exact quantity ≥ 1. */
exports.updateItem = asyncHandler(async (req, res) => {
  requireDB();
  const { productId } = req.params;
  const quantity = Number((req.body || {}).quantity);

  if (!validObjectId(productId)) throw fail(400, 'Invalid product id.');
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw fail(400, 'Quantity must be a whole number of at least 1 — use DELETE to remove an item.');
  }

  const product = await Product.findOne({ _id: productId, isActive: true }).select('stock');
  if (!product) throw fail(404, 'Product not found.');

  const cart = await getOrCreateCart(req.user._id);
  const line = cart.items.find((item) => String(item.product) === String(productId));
  if (!line) throw fail(404, 'Product not found in cart.');

  if (quantity > product.stock) {
    throw fail(400, `Only ${product.stock} unit(s) in stock.`);
  }

  line.quantity = quantity;
  await cart.save();
  await respondWithCart(res, req.user._id);
});

/** DELETE /api/cart/items/:productId — removes exactly that one line. */
exports.removeItem = asyncHandler(async (req, res) => {
  requireDB();
  const { productId } = req.params;
  if (!validObjectId(productId)) throw fail(400, 'Invalid product id.');

  const cart = await getOrCreateCart(req.user._id);
  const before = cart.items.length;
  cart.items = cart.items.filter((item) => String(item.product) !== String(productId));
  if (cart.items.length === before) throw fail(404, 'Product not found in cart.');

  await cart.save();
  await respondWithCart(res, req.user._id);
});

/** DELETE /api/cart — empties the cart (the user account is untouched). */
exports.clearCart = asyncHandler(async (req, res) => {
  requireDB();
  const cart = await getOrCreateCart(req.user._id);
  cart.items = [];
  await cart.save();
  await respondWithCart(res, req.user._id);
});
