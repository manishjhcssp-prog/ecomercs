/**
 * routes/adminRoutes.js — /api/admin (Phase 9). EVERY route here requires a valid
 * JWT whose user exists, is active, AND has role==='admin' — enforced ONCE via
 * router.use so no handler can be mounted without the gate.
 */
'use strict';

const router = require('express').Router();
const { protect, requireAdmin } = require('../middleware/authMiddleware');
const admin = require('../controllers/adminController');

// Backend-enforced admin gate for EVERYTHING below (directive §4/§5).
router.use(protect, requireAdmin);

router.get('/meta', admin.getMeta);
router.get('/dashboard', admin.getDashboard);

/* Products — writes delegate to the EXISTING productController (one system). */
router.get('/products', admin.listProducts);
router.post('/products', admin.createProduct);
router.get('/products/:id', admin.getProductById);
router.put('/products/:id', admin.updateProduct);
router.delete('/products/:id', admin.deleteProduct);

/* Inventory */
router.get('/inventory', admin.getInventory);
router.put('/inventory/:id/stock', admin.updateStock);

/* Users */
router.get('/users', admin.listUsers);
router.get('/users/:id', admin.getUserDetail);
router.put('/users/:id', admin.updateUser);

/* Orders */
router.get('/orders', admin.listOrders);
router.get('/orders/:id', admin.getOrderDetail);
router.put('/orders/:id/status', admin.updateOrderStatus);

/* Reviews — moderation (Phase 10) */
router.get('/reviews', admin.listReviews);
router.put('/reviews/:id/status', admin.setReviewApproval);
router.delete('/reviews/:id', admin.deleteReview);

module.exports = router;
