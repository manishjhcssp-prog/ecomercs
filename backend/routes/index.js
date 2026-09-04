/**
 * routes/index.js — single mount point for everything under /api/.
 *
 * Convention for future phases (each added as its own router file):
 *   /api/products  (Phase 4) · /api/auth|users (Phase 5) ·
 *   /api/cart|wishlist (Phase 6) · /api/orders (Phase 7) ·
 *   /api/payments (Phase 8)
 */
'use strict';

const router = require('express').Router();
const { dbStateLabel } = require('../config/database');

/**
 * GET /api/health — liveness probe.
 * Reports whether the process is up and how the database is doing.
 */
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'E-commerce API is running',
    data: {
      database: dbStateLabel(),
      environment: process.env.NODE_ENV || 'development',
      uptimeSeconds: Math.floor(process.uptime()),
    },
  });
});

// Phase 4 — Product System
router.use('/products', require('./productRoutes'));

// Phase 5 — Authentication & User System
router.use('/auth', require('./authRoutes'));
router.use('/users', require('./userRoutes'));

// Phase 6 — Shopping Cart & Wishlist
router.use('/cart', require('./cartRoutes'));
router.use('/wishlist', require('./wishlistRoutes'));

// Phase 7 — Checkout & Order System
router.use('/orders', require('./orderRoutes'));

// Phase 8 — Payments (Razorpay)
router.use('/payments', require('./paymentRoutes'));

// Phase Buildathon - AI Personal Shopper
router.use('/ai', require('./aiRoutes'));

// Phase 9 — Admin Dashboard & Management (protect + requireAdmin inside)
router.use('/admin', require('./adminRoutes'));

// Phase 10 — Reviews & Ratings
router.use('/reviews', require('./reviewRoutes'));

module.exports = router;
