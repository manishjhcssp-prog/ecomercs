/**
 * routes/wishlistRoutes.js — /api/wishlist, every route requires auth.
 */
'use strict';

const router = require('express').Router();
const controller = require('../controllers/wishlistController');
const { protect } = require('../middleware/authMiddleware');

router.use(protect);

router.route('/')
  .get(controller.getWishlist)
  .delete(controller.clearWishlist);

router.post('/:productId', controller.addProduct);
router.delete('/:productId', controller.removeProduct);

module.exports = router;
