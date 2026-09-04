/**
 * controllers/paymentController.js — Razorpay integration (Phase 8).
 *
 * SECURITY MODEL (directive §3/§9/§12 — non-negotiable):
 * - Secrets live ONLY in backend/.env (RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET).
 *   The frontend receives the PUBLIC key_id plus razorpay_order_id/amount — nothing else.
 * - The amount charged ALWAYS comes from the order document computed at creation time.
 *   Client-sent amounts/totals are ignored entirely, so a malicious client cannot turn
 *   a ₹500 order into a ₹1 payment that verifies.
 * - paymentStatus becomes "paid" ONLY after the backend recomputes Razorpay's
 *   HMAC-SHA256(razorpay_order_id|razorpay_payment_id, KEY_SECRET) and compares it to
 *   the returned signature with a timing-safe comparison. The browser's "success"
 *   callback alone proves nothing.
 * - Webhooks verify X-Razorpay-Signature (HMAC of the RAW body with the webhook
 *   secret) and are idempotent: an already-paid order is acknowledged, never
 *   re-processed.
 * - Failures leave orders unpaid and retryable; nothing is deleted.
 */
'use strict';

const crypto = require('crypto');
const mongoose = require('mongoose');
const Order = require('../models/Order');
const asyncHandler = require('../utils/asyncHandler');
const { PAYMENT_METHODS } = require('../utils/orderConfig');

function fail(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

/** Razorpay SDK instance, created lazily so a missing config only affects
 *  payment endpoints — the rest of the API keeps working. */
let razorpayClient = null;
function getRazorpay() {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    throw fail(503, 'Payments are not configured — add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to backend/.env.');
  }
  if (!razorpayClient) {
    const Razorpay = require('razorpay');
    razorpayClient = new Razorpay({ key_id: keyId, key_secret: keySecret });
  }
  return razorpayClient;
}

function requireDB() {
  if (mongoose.connection.readyState !== 1) {
    throw fail(503, 'Database not connected — set MONGODB_URI in backend/.env and restart the server.');
  }
}

/** Load an order that belongs to the caller and can still be paid. */
async function loadPayableOrder(orderId, userId) {
  if (!mongoose.isValidObjectId(orderId)) throw fail(400, 'Invalid order id.');
  const order = await Order.findOne({ _id: orderId, user: userId });
  if (!order) throw fail(404, 'Order not found.');
  if (order.paymentStatus === 'paid') throw fail(409, 'This order is already paid.');
  if (order.orderStatus === 'cancelled') throw fail(400, 'Cancelled orders cannot be paid.');
  return order;
}

/**
 * POST /api/payments/create {orderId}
 * Recalculates NOTHING from the client: the authoritative amount is
 * order.total (already computed server-side at order creation). Creates a
 * Razorpay order in PAISE (₹1 = 100 paise) and links it to our order.
 * Returns only what Razorpay's browser Checkout needs: keyId, razorpay
 * orderId, amount, currency.
 */
exports.createPayment = asyncHandler(async (req, res) => {
  requireDB();
  const order = await loadPayableOrder((req.body || {}).orderId, req.user._id);

  const amountInPaise = Math.round(order.total * 100);
  if (!Number.isInteger(amountInPaise) || amountInPaise < 100) {
    throw fail(400, 'Order total must be at least ₹1 to pay online.');
  }

  const rpOrder = await getRazorpay().orders.create({
    amount: amountInPaise,
    currency: 'INR',
    receipt: order.orderNumber,
    notes: { internalOrderId: String(order._id) },
  });

  order.paymentProvider = 'razorpay';
  order.paymentMethod = 'razorpay'; // was created COD? switching to online payment updates the method
  order.razorpayOrderId = rpOrder.id;
  await order.save();

  res.json({
    success: true,
    data: {
      keyId: process.env.RAZORPAY_KEY_ID, // PUBLIC identifier — safe for the browser
      razorpayOrderId: rpOrder.id,
      amount: rpOrder.amount, // paise, straight from Razorpay
      currency: rpOrder.currency,
      internalOrderId: String(order._id),
    },
  });
});

/** Timing-safe signature comparison (never use === on auth tags). */
function signaturesMatch(expected, received) {
  const a = Buffer.from(String(expected));
  const b = Buffer.from(String(received || ''));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function expectedPaymentSignature(razorpayOrderId, razorpayPaymentId) {
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!secret) throw fail(503, 'Payments are not configured — RAZORPAY_KEY_SECRET missing.');
  return crypto
    .createHmac('sha256', secret)
    .update(`${razorpayOrderId}|${razorpayPaymentId}`)
    .digest('hex');
}

/**
 * POST /api/payments/verify
 * Body (exactly what Razorpay's Checkout handler provides):
 *   { razorpay_order_id, razorpay_payment_id, razorpay_signature }
 * The backend recomputes the signature; only a genuine match marks PAID.
 * Idempotent: re-verifying the same successful payment is a friendly no-op.
 */
exports.verifyPayment = asyncHandler(async (req, res) => {
  requireDB();
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body || {};
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    throw fail(400, 'razorpay_order_id, razorpay_payment_id and razorpay_signature are required.');
  }

  const order = await Order.findOne({ razorpayOrderId: razorpay_order_id, user: req.user._id });
  if (!order) throw fail(404, 'No matching order for this payment.');

  if (!signaturesMatch(expectedPaymentSignature(razorpay_order_id, razorpay_payment_id), razorpay_signature)) {
    throw fail(400, 'Payment verification failed — signature mismatch.');
  }

  if (order.paymentStatus === 'paid') {
    /* Idempotent retry of an already-verified payment. */
    return res.json({ success: true, message: 'Payment already verified.', data: order.toJSON() });
  }

  order.paymentStatus = 'paid';
  order.razorpayPaymentId = String(razorpay_payment_id);
  order.paymentSignature = String(razorpay_signature);
  order.paidAt = new Date();
  if (order.orderStatus === 'pending') order.orderStatus = 'confirmed'; // paid orders move forward
  await order.save();

  res.json({ success: true, message: 'Payment verified.', data: order.toJSON() });
});

/**
 * POST /api/payments/webhook
 * Razorpay → server notifications. Requires the RAW request body for signature
 * verification (server.js captures it on req.rawBody). Idempotent by payment id.
 * NOTE: webhook events are not user-scoped — authenticity comes ENTIRELY from
 * the verified signature, which is why the raw-body HMAC check runs first.
 */
exports.webhook = (req, res) => {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) {
    return res.status(503).json({ success: false, message: 'Webhook secret not configured.' });
  }

  const signature = req.headers['x-razorpay-signature'];
  const expected = crypto.createHmac('sha256', secret).update(req.rawBody || '').digest('hex');

  if (!signaturesMatch(expected, signature)) {
    return res.status(400).json({ success: false, message: 'Invalid webhook signature.' });
  }

  const event = req.body && req.body.event;
  const payment = req.body && req.body.payload && req.body.payload.payment && req.body.payload.payment.entity;

  /* Respond fast; heavy work only for the one event we care about. */
  if (event === 'payment.captured' && payment) {
    Order.findOne({ razorpayOrderId: payment.order_id })
      .then(async (order) => {
        if (!order) return;
        if (order.paymentStatus === 'paid') return; // idempotent — never double-process
        order.paymentStatus = 'paid';
        order.razorpayPaymentId = String(payment.id || '');
        order.paidAt = new Date();
        if (order.orderStatus === 'pending') order.orderStatus = 'confirmed';
        await order.save();
      })
      .catch((err) => console.error('[payments] webhook processing error:', err.message));
  }

  /* Always 200 once the signature is valid, so Razorpay stops retrying. */
  return res.json({ received: true });
};

module.exports = {
  createPayment: exports.createPayment,
  verifyPayment: exports.verifyPayment,
  webhook: exports.webhook,
  // exported for offline self-tests (utils/paymentSelfTest.js)
  _internals: { signaturesMatch, expectedPaymentSignature },
};
