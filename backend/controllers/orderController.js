/**
 * controllers/orderController.js — checkout & orders (Phase 7).
 *
 * SECURITY MODEL
 * - Every route sits behind `protect`; every query is scoped to req.user._id.
 * - Clients may submit ONLY {addressId, paymentMethod?}. Prices, subtotal,
 *   discount, tax, shipping and total are ALWAYS recomputed server-side from
 *   live product documents — client totals are ignored.
 * - Users cannot change orderStatus/paymentStatus through any endpoint here;
 *   cancellation is a dedicated action with its own rules.
 *
 * ATOMICITY (directive §27)
 * createOrder runs inside a MongoDB transaction:
 *   1. insert the Order
 *   2. per item, atomically decrement stock with a conditional guard
 *      ({ _id, stock: { $gte: qty } } + $inc −qty); modifiedCount === 0 means
 *      a concurrent purchase won the race → throw → whole transaction aborts
 *   3. clear the user's cart
 * Any failure rolls back ALL three steps — no orphan orders, no lost stock,
 * no emptied carts. Atlas (replica set) supports multi-document transactions.
 */
'use strict';

const mongoose = require('mongoose');
const Order = require('../models/Order');
const Product = require('../models/Product');
const Cart = require('../models/Cart');
const User = require('../models/User');
const asyncHandler = require('../utils/asyncHandler');
const { SHIPPING_FEE, FREE_SHIPPING_OVER, TAX_RATE, PAYMENT_METHODS, USER_CANCELLABLE_STATUSES } = require('../utils/orderConfig');

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

/** Human-friendly display id, e.g. NM-K2X9FQ-83HF (unique via random suffix). */
function generateOrderNumber() {
  const stamp = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `NM-${stamp}-${rand}`;
}

/** Snapshot the chosen saved address (history-proof copy on the order). */
async function resolveShippingAddress(userId, addressId) {
  if (!addressId || !mongoose.isValidObjectId(addressId)) {
    throw fail(400, 'A valid addressId is required.');
  }
  const user = await User.findById(userId).select('addresses');
  const address = user && user.addresses.id(addressId);
  if (!address) throw fail(404, 'Address not found.');

  return {
    fullName: address.fullName,
    phone: address.phone,
    addressLine1: address.addressLine1,
    addressLine2: address.addressLine2 || '',
    city: address.city,
    state: address.state,
    postalCode: address.postalCode,
    country: address.country,
  };
}

/**
 * POST /api/orders {addressId, paymentMethod?}
 * Flow: validate address → load DB cart → validate products/stock → compute
 * money server-side → TRANSACTION(order ← guarded stock dec ← clear cart).
 */
exports.createOrder = asyncHandler(async (req, res) => {
  requireDB();
  const { addressId } = req.body || {};
  let paymentMethod = ((req.body || {}).paymentMethod || 'cod').toLowerCase();
  if (!PAYMENT_METHODS.includes(paymentMethod)) {
    throw fail(400, `"${paymentMethod}" is not an accepted payment method yet (supported: ${PAYMENT_METHODS.join(', ')}).`);
  }

  /* Address (owned by this user only) */
  const shippingAddress = await resolveShippingAddress(req.user._id, addressId);

  /* The DATABASE cart is authoritative — nothing about the cart comes from the client. */
  const cart = await Cart.findOne({ user: req.user._id });
  if (!cart || cart.items.length === 0) throw fail(400, 'Your cart is empty.');

  /* Fresh product data for validation + pricing. */
  const productIds = cart.items.map((line) => line.product);
  const products = await Product.find({ _id: { $in: productIds }, isActive: true }).select('name images price stock');

  const lines = cart.items.map((line) => {
    const product = products.find((p) => String(p._id) === String(line.product));
    if (!product) {
      throw fail(409, 'One of your cart items is no longer available. Please review your cart.');
    }
    if (line.quantity > product.stock) {
      throw fail(409, `Insufficient stock for "${product.name}" (requested ${line.quantity}, available ${product.stock}).`);
    }
    return {
      product: product._id,
      name: product.name,
      image: Array.isArray(product.images) && product.images[0] ? product.images[0] : '',
      price: Number(product.price),
      quantity: line.quantity,
    };
  });

  /* Server-side money math — the only authoritative calculation. */
  const subtotal = Math.round(lines.reduce((sum, l) => sum + l.price * l.quantity, 0) * 100) / 100;
  const discount = 0; // coupon engine arrives later
  const shippingFee = subtotal >= FREE_SHIPPING_OVER ? 0 : SHIPPING_FEE;
  const tax = Math.round(subtotal * TAX_RATE * 100) / 100;
  const total = Math.round((subtotal - discount + shippingFee + tax) * 100) / 100;

  /* ---------- TRANSACTIONAL CORE ---------- */
  const order = await mongoose.connection.transaction(async (session) => {
    const created = await Order.create(
      [{
        user: req.user._id,
        orderNumber: generateOrderNumber(),
        items: lines,
        shippingAddress,
        subtotal,
        discount,
        shippingFee,
        tax,
        total,
        paymentMethod,
        aiAssisted: req.body && req.body.aiAssisted === true,
        aiInteractions: (req.body && Number(req.body.aiInteractions)) || 0,
      }],
      { session }
    );

    /* Guarded decrement per item: the stock condition lives INSIDE the update,
       so two concurrent buyers cannot both pass once stock is exhausted. */
    for (const line of lines) {
      const result = await Product.updateOne(
        { _id: line.product, stock: { $gte: line.quantity } },
        { $inc: { stock: -line.quantity } },
        { session }
      );
      if (result.modifiedCount !== 1) {
        const doc = await Product.findById(line.product).select('name').session(session);
        throw fail(409, `Insufficient stock for "${doc ? doc.name : 'an item'}" — someone beat you to the last unit(s).`);
      }
    }

    await Cart.updateOne({ user: req.user._id }, { $set: { items: [] } }, { session });

    return created[0];
  });

  res.status(201).json({
    success: true,
    message: 'Order placed successfully.',
    data: order.toJSON(),
  });
});

/**
 * GET /api/orders?page=1&limit=10 — the authenticated user's history, newest first.
 */
exports.listOrders = asyncHandler(async (req, res) => {
  requireDB();
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 10));

  const filter = { user: req.user._id };
  const [total, orders] = await Promise.all([
    Order.countDocuments(filter),
    Order.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .select('orderNumber createdAt total orderStatus paymentStatus items'),
  ]);

  res.json({
    success: true,
    data: {
      orders: orders.map((o) => ({
        id: String(o._id),
        orderNumber: o.orderNumber,
        createdAt: o.createdAt,
        total: o.total,
        orderStatus: o.orderStatus,
        paymentStatus: o.paymentStatus,
        itemCount: o.items.reduce((sum, item) => sum + item.quantity, 0),
      })),
      pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
    },
  });
});

/** GET /api/orders/:id — owner-scoped; foreign/missing ids get the SAME 404. */
exports.getOrder = asyncHandler(async (req, res) => {
  requireDB();
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) throw fail(400, 'Invalid order id.');

  const order = await Order.findOne({ _id: id, user: req.user._id });
  if (!order) throw fail(404, 'Order not found.');

  res.json({ success: true, data: order.toJSON() });
});

/**
 * POST /api/orders/:id/cancel
 * Allowed while pending|confirmed (see utils/orderConfig.js). Restores stock
 * inside a transaction so a cancelled order always gives items back exactly once.
 */
exports.cancelOrder = asyncHandler(async (req, res) => {
  requireDB();
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) throw fail(400, 'Invalid order id.');

  const order = await Order.findOne({ _id: id, user: req.user._id });
  if (!order) throw fail(404, 'Order not found.');

  if (order.orderStatus === 'cancelled') throw fail(400, 'This order is already cancelled.');
  if (!USER_CANCELLABLE_STATUSES.includes(order.orderStatus)) {
    throw fail(400, `Orders can no longer be cancelled once they are ${order.orderStatus}.`);
  }

  await mongoose.connection.transaction(async (session) => {
    for (const item of order.items) {
      await Product.updateOne({ _id: item.product }, { $inc: { stock: item.quantity } }, { session });
    }
    order.orderStatus = 'cancelled';
    order.paymentStatus = order.paymentStatus === 'pending' ? 'failed' : order.paymentStatus;
    order.cancelledAt = new Date();
    await order.save({ session });
  });

  res.json({ success: true, message: 'Order cancelled.', data: order.toJSON() });
});
