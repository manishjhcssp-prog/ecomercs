/**
 * routes/productRoutes.js — /api/products route definitions.
 * Public READS stay open (storefront). WRITES are admin-only since Phase 9:
 * protect (valid JWT + live active user) then requireAdmin (role check).
 *
 * Phase 10 adds: nested product reviews (public read w/ optionalAuth,
 * authenticated create) and related-products (public).
 */
'use strict';

const router = require('express').Router();
const controller = require('../controllers/productController');
const reviewController = require('../controllers/reviewController');
const { protect, requireAdmin, optionalAuth } = require('../middleware/authMiddleware');
const { rateLimit } = require('../utils/rateLimiter');

/* Phase 11: review creation is a write from authenticated users — modest cap
   against spam while leaving normal reviewing untouched. */
const createReviewLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 20, keyBy: 'rv-create',
  message: 'Too many reviews submitted — please try again later.',
});

router.route('/').get(controller.getProducts).post(protect, requireAdmin, controller.createProduct);

/* Reviews of a product — public read (personalized via optionalAuth),
   creation for any authenticated customer. */
router
  .route('/:productId/reviews')
  .get(optionalAuth, reviewController.getProductReviews)
  .post(protect, createReviewLimiter, reviewController.createReview);

/* Related products — same category (topped up by same brand), active only. */
router.get('/:id/related', controller.getRelatedProducts);

router
  .route('/:id')
  .get(controller.getProductById)
  .put(protect, requireAdmin, controller.updateProduct)
  .delete(protect, requireAdmin, controller.deleteProduct);

module.exports = router;
