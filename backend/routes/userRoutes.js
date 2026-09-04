/**
 * routes/userRoutes.js — protected /api/users endpoints (Phases 5 & 7).
 * Everything below requires a valid Bearer token.
 */
'use strict';

const router = require('express').Router();
const controller = require('../controllers/userController');
const addressController = require('../controllers/addressController');
const { protect, requireAdmin } = require('../middleware/authMiddleware');

router.use(protect); // all user routes are authenticated

router.route('/profile').get(controller.getProfile).put(controller.updateProfile);

// Phase 7 — Address book (lives on the User model)
router.route('/addresses')
  .get(addressController.listAddresses)
  .post(addressController.createAddress);
router.route('/addresses/:addressId')
  .put(addressController.updateAddress)
  .delete(addressController.deleteAddress);

/* Example for later phases (kept as documentation, not mounted):
   router.get('/admin-only', requireAdmin, someAdminHandler); */

module.exports = router;
module.exports.requireAdmin = requireAdmin; // re-exported convenience
