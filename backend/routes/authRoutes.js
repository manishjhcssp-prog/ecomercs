/**
 * routes/authRoutes.js — /api/auth endpoints (Phase 5).
 * Phase 11: brute-force protection on the two public credential endpoints.
 * Limits are deliberately generous for real users (see agent_memory.md):
 *   login    30 attempts / 15 min / IP
 *   register 10 accounts  / 15 min / IP
 */
'use strict';

const router = require('express').Router();
const controller = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');
const { rateLimit } = require('../utils/rateLimiter');

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 30, keyBy: 'login',
  message: 'Too many sign-in attempts — please wait a few minutes and try again.',
});
const registerLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 10, keyBy: 'register',
  message: 'Too many registrations from this network — please try again later.',
});

router.post('/register', registerLimiter, controller.register);
router.post('/login', loginLimiter, controller.login);
router.get('/me', protect, controller.me);

module.exports = router;
