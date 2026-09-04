/**
 * routes/orderRoutes.js — /api/orders, all routes require a valid Bearer token.
 */
'use strict';

const router = require('express').Router();
const controller = require('../controllers/orderController');
const { protect } = require('../middleware/authMiddleware');

router.use(protect);

router.post('/', controller.createOrder);
router.get('/', controller.listOrders);
router.get('/:id', controller.getOrder);
router.post('/:id/cancel', controller.cancelOrder);

module.exports = router;
