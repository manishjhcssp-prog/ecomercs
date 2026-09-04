/**
 * models/Order.js — immutable purchase record (Phase 7).
 *
 * Historical safety: each item SNAPSHOTs name/image/price at purchase time, and
 * the shippingAddress is embedded as a copy — later product edits or address
 * changes never rewrite history.
 *
 * Money fields are computed SERVER-side at creation from live product prices;
 * clients cannot submit totals (controller ignores/rejects them).
 *
 * Status systems are strict enums (no arbitrary strings):
 *   orderStatus   : pending|confirmed|processing|shipped|delivered|cancelled
 *   paymentStatus : pending|paid|failed|refunded
 *   paymentMethod : cod (more arrive with the payment phase)
 */
'use strict';

const mongoose = require('mongoose');
const { ORDER_STATUSES, PAYMENT_STATUSES, PAYMENT_METHODS } = require('../utils/orderConfig');

const orderItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    name: { type: String, required: true, trim: true },
    image: { type: String, default: '' },
    price: {
      type: Number,
      required: true,
      min: [0, 'Price cannot be negative'],
    },
    quantity: {
      type: Number,
      required: true,
      min: [1, 'Quantity must be at least 1'],
      validate: { validator: Number.isInteger, message: 'Quantity must be a whole number' },
    },
  },
  { _id: false }
);

/** Snapshot of the chosen address — plain values, no ref, history-proof. */
const shippingAddressSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true },
    phone: { type: String, required: true },
    addressLine1: { type: String, required: true },
    addressLine2: { type: String, default: '' },
    city: { type: String, required: true },
    state: { type: String, required: true },
    postalCode: { type: String, required: true },
    country: { type: String, required: true },
  },
  { _id: false }
);

function enumField(values, label) {
  return {
    type: String,
    enum: { values, message: '"{VALUE}" is not a valid ' + label },
    default: values[0],
  };
}

const orderSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    /** Human-friendly display number, e.g. NM-K2X9FQ-83HF. */
    orderNumber: { type: String, required: true, unique: true },

    items: {
      type: [orderItemSchema],
      required: true,
      validate: { validator: (v) => Array.isArray(v) && v.length > 0, message: 'Order must contain at least one item' },
    },

    shippingAddress: { type: shippingAddressSchema, required: true },

    subtotal: { type: Number, required: true, min: 0 },
    discount: { type: Number, required: true, min: 0, default: 0 },
    shippingFee: { type: Number, required: true, min: 0 },
    tax: { type: Number, required: true, min: 0 },
    total: { type: Number, required: true, min: 0 },

    paymentMethod: enumField(PAYMENT_METHODS, 'payment method'),
    paymentStatus: enumField(PAYMENT_STATUSES, 'payment status'),
    orderStatus: enumField(ORDER_STATUSES, 'order status'),

    /** Razorpay bookkeeping (Phase 8). No card/bank data is ever stored. */
    paymentProvider: { type: String, default: '' },
    razorpayOrderId: { type: String, default: '', index: true },
    razorpayPaymentId: { type: String, default: '' },
    paymentSignature: { type: String, default: '' },
    paidAt: { type: Date, default: null },

    cancelledAt: { type: Date, default: null },
  },
  { timestamps: true, toJSON: { versionKey: false } }
);

/** Convenience for list views / confirmation screens. */
orderSchema.virtual('itemCount').get(function () {
  return this.items.reduce((sum, item) => sum + item.quantity, 0);
});
orderSchema.set('toJSON', { virtuals: true, versionKey: false });

module.exports = mongoose.model('Order', orderSchema);
