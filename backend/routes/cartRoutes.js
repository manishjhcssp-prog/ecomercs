/**
 * routes/cartRoutes.js — /api/cart, every route requires a valid Bearer token.
 */
'use strict';

const router = require('express').Router();
const controller = require('../controllers/cartController');
const { protect } = require('../middleware/authMiddleware');

router.use(protect);

router.route('/')
  .get(controller.getCart)
  .delete(controller.clearCart);

router.post('/items', controller.addItem);
router.put('/items/:productId', controller.updateItem);
router.delete('/items/:productId', controller.removeItem);

module.exports = router;
