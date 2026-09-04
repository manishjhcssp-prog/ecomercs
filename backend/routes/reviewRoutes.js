/**
 * routes/reviewRoutes.js — /api/reviews (Phase 10).
 *
 * Flat owner-scoped mutations. Creation lives nested on products
 * (POST /api/products/:productId/reviews) per REST convention; everything
 * here requires a valid Bearer token and enforces OWNERSHIP in the
 * controller (admins have their own moderation API under /api/admin).
 */
'use strict';

const router = require('express').Router();
const controller = require('../controllers/reviewController');
const { protect } = require('../middleware/authMiddleware');

router.use(protect);

router.route('/:reviewId')
  .put(controller.updateReview)
  .delete(controller.deleteReview);

module.exports = router;
