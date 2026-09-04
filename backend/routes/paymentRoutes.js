/**
 * routes/paymentRoutes.js — /api/payments (Phase 8).
 *
 * create/verify require a Bearer token (payments belong to a user).
 * The webhook is PUBLIC by nature — Razorpay cannot send Bearer tokens — so its
 * authenticity comes entirely from the raw-body HMAC signature verified in the
 * controller using req.rawBody (captured by server.js's express.json verify
 * callback BEFORE parsing, so the exact bytes Razorpay signed are available).
 */
'use strict';

const router = require('express').Router();
const controller = require('../controllers/paymentController');
const { protect } = require('../middleware/authMiddleware');
const { rateLimit } = require('../utils/rateLimiter');

/* Phase 11: payment endpoints are expensive (gateway calls) and fraud-relevant. */
const payLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 60, keyBy: 'pay' });
/* Webhooks come from Razorpay infrastructure, not users — do not rate-limit them;
   authenticity is enforced by the HMAC signature check instead. */
const webhookLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 300, keyBy: 'hook' });

router.post('/create', protect, payLimiter, controller.createPayment);
router.post('/verify', protect, payLimiter, controller.verifyPayment);
router.post('/webhook', webhookLimiter, controller.webhook);

module.exports = router;
