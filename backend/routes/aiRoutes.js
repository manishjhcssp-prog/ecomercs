const express = require('express');
const { chatWithAI } = require('../controllers/aiController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

// AI routes are protected because they manipulate the user's cart
router.post('/chat', protect, chatWithAI);

module.exports = router;
