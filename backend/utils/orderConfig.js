/**
 * utils/orderConfig.js — backend-authoritative business rules for orders (Phase 7).
 *
 * The FRONTEND may display similar numbers for UX, but THESE values are what the
 * server uses when creating an order. Client-submitted totals are never trusted.
 *
 * All values are placeholders chosen for the demo scope:
 * - Shipping: flat ₹49, free over ₹999 (mirrors the storefront's displayed rule)
 * - Tax: flat 5% GST-style rate (no slabs/categories yet — "advanced tax engine"
 *   stays out of scope per directive §29)
 * - Discount: always 0 until a coupon system exists
 */
'use strict';

module.exports = {
  SHIPPING_FEE: 49,
  FREE_SHIPPING_OVER: 999,
  TAX_RATE: 0.05,
  CURRENCY: 'INR',

  ORDER_STATUSES: ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'],
  PAYMENT_STATUSES: ['pending', 'paid', 'failed', 'refunded'],
  PAYMENT_METHODS: ['cod', 'razorpay'], // online gateway added in Phase 8

  /** Statuses from which the user may cancel (recorded in agent_memory.md). */
  USER_CANCELLABLE_STATUSES: ['pending', 'confirmed'],
};
