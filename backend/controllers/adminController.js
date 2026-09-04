/**
 * controllers/adminController.js â€” Admin Dashboard & Management (Phase 9).
 *
 * Every function here runs BEHIND routes/adminRoutes.js's router.use(protect,
 * requireAdmin) â€” no per-function role checks needed, but each handler still
 * assumes an authenticated admin exists on req.user.
 *
 * REUSE over reinvention: product create/update/delete delegate to the EXISTING
 * productController (same validation, same soft-delete semantics); order status
 * cancellation mirrors orderController.cancelOrder's transactional stock restore.
 * Payment status is VIEW-ONLY for admins â€” there is deliberately NO "mark as paid"
 * endpoint (directive Â§20); paid comes only from verified gateway information.
 */
'use strict';

const mongoose = require('mongoose');
const User = require('../models/User');
const Product = require('../models/Product');
const Order = require('../models/Order');
const asyncHandler = require('../utils/asyncHandler');
const { ORDER_STATUSES } = require('../utils/orderConfig');
const { LOW_STOCK_THRESHOLD, ADMIN_STATUS_TRANSITIONS } = require('../utils/adminConfig');

function fail(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

function requireDB() {
  if (mongoose.connection.readyState !== 1) {
    throw fail(503, 'Database not connected â€” set MONGODB_URI in backend/.env and restart the server.');
  }
}

/* ================= META (for the admin UI) ================= */

/** GET /api/admin/meta â€” lets the UI mirror server config instead of hard-coding. */
exports.getMeta = (req, res) => {
  const categories = Product.schema.path('category').enumValues || [];
  res.json({
    success: true,
    data: {
      lowStockThreshold: LOW_STOCK_THRESHOLD,
      orderStatuses: ORDER_STATUSES,
      statusTransitions: ADMIN_STATUS_TRANSITIONS,
      productCategories: categories,
    },
  });
};

/* ================= DASHBOARD ================= */

/** GET /api/admin/dashboard â€” every metric computed in the DATABASE, none faked. */
exports.getDashboard = asyncHandler(async (req, res) => {
  requireDB();

  const [totalUsers, totalProducts, activeProducts, statusCounts, revenueAgg, lowStock] =
    await Promise.all([
      User.countDocuments({}),
      Product.countDocuments({}),
      Product.countDocuments({ isActive: true }),
      Order.aggregate([{ $group: { _id: '$orderStatus', count: { $sum: 1 } } }]),
      Order.aggregate([
        { $match: { orderStatus: { $ne: 'cancelled' } } }, // business rule: cancelled orders are not revenue
        { $group: { _id: null, total: { $sum: '$total' } } },
      ]),
      Product.find(
        { stock: { $lte: LOW_STOCK_THRESHOLD } },
        'name stock price isActive'
      ).sort({ stock: 1 }).limit(20).lean(),
    ]);

  const byStatus = Object.fromEntries(statusCounts.map((s) => [s._id, s.count]));
  const sum = (keys) => keys.reduce((acc, k) => acc + (byStatus[k] || 0), 0);

  res.json({
    success: true,
    data: {
      totalUsers,
      totalProducts,
      activeProducts,
      totalOrders: sum(ORDER_STATUSES),
      pendingOrders: sum(['pending', 'confirmed']),
      processingOrders: byStatus.processing || 0,
      shippedOrders: byStatus.shipped || 0,
      completedOrders: byStatus.delivered || 0,
      cancelledOrders: byStatus.cancelled || 0,
      totalRevenue: revenueAgg[0] ? Math.round(revenueAgg[0].total * 100) / 100 : 0,
      lowStockThreshold: LOW_STOCK_THRESHOLD,
      lowStockCount: lowStock.filter((p) => p.stock > 0).length,
      outOfStockCount: lowStock.filter((p) => p.stock === 0).length,
      lowStockProducts: lowStock.map((p) => ({
        id: String(p._id),
        name: p.name,
        stock: p.stock,
        price: p.price,
        isActive: p.isActive,
      })),
    },
  });
});

/* ================= PRODUCTS ================= */

/** GET /api/admin/products?search&category&status=all|active|inactive&page&limit */
exports.listProducts = asyncHandler(async (req, res) => {
  requireDB();
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 10));
  const filter = {};

  if (req.query.search) {
    const rx = new RegExp(String(req.query.search).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ name: rx }, { brand: rx }];
  }
  if (req.query.category && req.query.category !== 'all') filter.category = req.query.category;
  if (req.query.status === 'active') filter.isActive = true;
  if (req.query.status === 'inactive') filter.isActive = false;

  const [products, total] = await Promise.all([
    Product.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).select('-__v'),
    Product.countDocuments(filter),
  ]);

  res.json({
    success: true,
    data: {
      products,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    },
  });
});

/* create/update/delete DELEGATE to the existing product controller â€” one product
   system only. They are simply gated behind requireAdmin at the router level. */
exports.createProduct = require('./productController').createProduct;
exports.updateProduct = require('./productController').updateProduct;
exports.deleteProduct = require('./productController').deleteProduct;
exports.getProductById = require('./productController').getProductById;

/* ================= INVENTORY ================= */

/**
 * GET /api/admin/inventory â€” stock-focused list sorted most-urgent first.
 * Status is COMPUTED server-side from LOW_STOCK_THRESHOLD (never trusted to client).
 */
exports.getInventory = asyncHandler(async (req, res) => {
  requireDB();
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));

  const [products, total] = await Promise.all([
    Product.find({}, 'name stock price isActive category')
      .sort({ stock: 1, name: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Product.countDocuments({}),
  ]);

  const withStatus = products.map((p) => ({
    id: String(p._id),
    name: p.name,
    category: p.category,
    price: p.price,
    stock: p.stock,
    isActive: p.isActive,
    status: p.stock === 0 ? 'out' : p.stock <= LOW_STOCK_THRESHOLD ? 'low' : 'ok',
  }));

  res.json({
    success: true,
    data: {
      items: withStatus,
      lowStockThreshold: LOW_STOCK_THRESHOLD,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    },
  });
});

/** PUT /api/admin/inventory/:id/stock {stock} â€” quick stock adjustment from inventory view. */
exports.updateStock = asyncHandler(async (req, res) => {
  requireDB();
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) throw fail(400, 'Invalid product id.');

  const stock = Number((req.body || {}).stock);
  if (!Number.isInteger(stock) || stock < 0) {
    throw fail(400, 'Stock must be a whole number of 0 or more.');
  }

  /* Delegated to updateOne so a deactivated product can still receive stock. */
  const updated = await Product.findByIdAndUpdate(
    id,
    { $set: { stock } },
    { new: true, runValidators: true }
  ).select('name stock price isActive');
  if (!updated) throw fail(404, 'Product not found.', );

  res.json({ success: true, message: 'Stock updated.', data: updated });
});

/* ================= USERS ================= */

/* Phase 11: the LIST endpoint no longer returns users' full address books —
   that data belongs to the detail view (and order records) only. */
const LIST_USER_FIELDS = 'name email phone role isActive createdAt';
const SAFE_USER_FIELDS = 'name email phone role isActive createdAt addresses';

/** GET /api/admin/users?search&page&limit â€” safe fields ONLY (no password material). */
exports.listUsers = asyncHandler(async (req, res) => {
  requireDB();
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 10));
  const filter = {};

  if (req.query.search) {
    const rx = new RegExp(String(req.query.search).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ name: rx }, { email: rx }];
  }

  const [users, total] = await Promise.all([
    User.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).select(LIST_USER_FIELDS),
    User.countDocuments(filter),
  ]);

  res.json({
    success: true,
    data: {
      users,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    },
  });
});

/** GET /api/admin/users/:id â€” safe detail incl. their address book + order stats. */
exports.getUserDetail = asyncHandler(async (req, res) => {
  requireDB();
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) throw fail(400, 'Invalid user id.');

  const user = await User.findById(id).select(SAFE_USER_FIELDS);
  if (!user) throw fail(404, 'User not found.');

  const [orderCount, spentAgg] = await Promise.all([
    Order.countDocuments({ user: user._id }),
    Order.aggregate([
      { $match: { user: user._id, orderStatus: { $ne: 'cancelled' } } },
      { $group: { _id: null, total: { $sum: '$total' } } },
    ]),
  ]);

  res.json({
    success: true,
    data: {
      ...user.toJSON(),
      orderCount,
      lifetimeValue: spentAgg[0] ? Math.round(spentAgg[0].total * 100) / 100 : 0,
    },
  });
});

/**
 * PUT /api/admin/users/:id â€” WHITELISTED to {isActive} only.
 * Role changes are NOT exposed (dangerous; would need explicit user approval).
 * Safety rail: an admin cannot deactivate their own account.
 */
exports.updateUser = asyncHandler(async (req, res) => {
  requireDB();
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) throw fail(400, 'Invalid user id.');

  const body = req.body || {};
  const keys = Object.keys(body);
  if (keys.length !== 1 || typeof body.isActive !== 'boolean') {
    throw fail(400, "Only { isActive: true|false } may be changed here.");
  }
  if (String(req.user._id) === id && body.isActive === false) {
    throw fail(400, 'You cannot deactivate your own account.');
  }

  const user = await User.findByIdAndUpdate(id, { $set: { isActive: body.isActive } }, {
    new: true,
    runValidators: true,
  }).select(SAFE_USER_FIELDS);
  if (!user) throw fail(404, 'User not found.');

  res.json({
    success: true,
    message: body.isActive ? 'Account activated.' : 'Account deactivated.',
    data: user,
  });
});

/* ================= ORDERS ================= */

/** GET /api/admin/orders?status&page&limit â€” every user's orders, newest first. */
exports.listOrders = asyncHandler(async (req, res) => {
  requireDB();
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 10));
  const filter = {};
  if (req.query.status && ORDER_STATUSES.includes(req.query.status)) {
    filter.orderStatus = req.query.status;
  }

  const [orders, total] = await Promise.all([
    Order.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('user', 'name email')
      // NOTE: include items â€” itemCount is computed below (the model virtual
      // reads this.items, which would be undefined if items were not selected).
      .select('orderNumber user createdAt total paymentMethod paymentStatus orderStatus items'),
    Order.countDocuments(filter),
  ]);

  res.json({
    success: true,
    data: {
      orders: orders.map((o) => ({
        id: String(o._id),
        orderNumber: o.orderNumber,
        customer: o.user ? { id: String(o.user._id), name: o.user.name, email: o.user.email } : null,
        createdAt: o.createdAt,
        total: o.total,
        itemCount: o.items.reduce((sum, item) => sum + item.quantity, 0),
        paymentMethod: o.paymentMethod,
        paymentStatus: o.paymentStatus,
        orderStatus: o.orderStatus,
      })),
      pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
    },
  });
});

/** GET /api/admin/orders/:id â€” full detail of ANY user's order (support view). */
exports.getOrderDetail = asyncHandler(async (req, res) => {
  requireDB();
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) throw fail(400, 'Invalid order id.');

  const order = await Order.findById(id).populate('user', 'name email');
  if (!order) throw fail(404, 'Order not found.');

  res.json({
    success: true,
    data: {
      ...order.toJSON(),
      customer: order.user
        ? { id: String(order.user._id), name: order.user.name, email: order.user.email }
        : null,
    },
  });
});

/**
 * PUT /api/admin/orders/:id/status {orderStatus}
 * Transition map prevents impossible jumps; cancelling reuses the SAME
 * transactional stock-restore semantics as the user-facing cancel endpoint.
 * Totals, item prices and payment verification are NEVER editable here.
 */
exports.updateOrderStatus = asyncHandler(async (req, res) => {
  requireDB();
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) throw fail(400, 'Invalid order id.');

  const next = (req.body || {}).orderStatus;
  if (!ORDER_STATUSES.includes(next)) {
    throw fail(400, `"${next ?? ''}" is not a valid order status.`);
  }

  const order = await Order.findById(id);
  if (!order) throw fail(404, 'Order not found.');

  if (order.orderStatus === next) {
    return res.json({ success: true, message: 'Order already in that status.', data: order.toJSON() });
  }

  const allowed = ADMIN_STATUS_TRANSITIONS[order.orderStatus] || [];
  if (!allowed.includes(next)) {
    throw fail(400, `Cannot move an order from ${order.orderStatus} to ${next}. Allowed: ${allowed.join(', ') || 'none'}.`);
  }

  if (next === 'cancelled') {
    /* Same semantics as user cancellation: restore stock atomically. */
    await mongoose.connection.transaction(async (session) => {
      for (const item of order.items) {
        await Product.updateOne({ _id: item.product }, { $inc: { stock: item.quantity } }, { session });
      }
      order.orderStatus = 'cancelled';
      order.paymentStatus = order.paymentStatus === 'pending' ? 'failed' : order.paymentStatus;
      order.cancelledAt = new Date();
      await order.save({ session });
    });
    return res.json({ success: true, message: 'Order cancelled â€” stock restored.', data: order.toJSON() });
  }

  order.orderStatus = next;
  await order.save();
  res.json({ success: true, message: `Order moved to ${next}.`, data: order.toJSON() });
});

/* ============================================================
   PHASE 10 â€” REVIEW MODERATION
   Policy: new/edited reviews start isApproved:false. Admins
   approve (make public + count in rating) or hide (unapprove).
   Every action recomputes the product's rating summary from the
   approved set via reviewController.recomputeProductRating.
   ============================================================ */

const Review = require('../models/Review');
const { recomputeProductRating } = require('./reviewController');

/** GET /api/admin/reviews?status=pending|approved|all&product&page&limit&q */
exports.listReviews = asyncHandler(async (req, res) => {
  requireDB();

  const status = ['pending', 'approved', 'all'].includes(String(req.query.status))
    ? String(req.query.status) : 'pending';
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));

  const filter = {};
  if (status === 'pending') filter.isApproved = false;
  if (status === 'approved') filter.isApproved = true;
  if (req.query.product && mongoose.isValidObjectId(String(req.query.product))) {
    filter.product = new mongoose.Types.ObjectId(String(req.query.product));
  }
  if (req.query.q && String(req.query.q).trim()) {
    const rx = new RegExp(String(req.query.q).trim().slice(0, 100).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ comment: rx }, { title: rx }];
  }

  const [items, total] = await Promise.all([
    Review.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('user', 'name email')
      .populate('product', 'name')
      .select('user product rating title comment isApproved verifiedPurchase createdAt'),
    Review.countDocuments(filter),
  ]);

  res.json({
    success: true,
    data: items,
    pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
    meta: { status },
  });
});

/** PUT /api/admin/reviews/:id/status {isApproved:boolean} â€” approve or hide. */
exports.setReviewApproval = asyncHandler(async (req, res) => {
  requireDB();
  if (!mongoose.isValidObjectId(req.params.id)) throw fail(400, 'Invalid review id');
  if (typeof req.body?.isApproved !== 'boolean') {
    throw fail(400, 'Body must be {isApproved: boolean}');
  }

  const review = await Review.findById(req.params.id);
  if (!review) throw fail(404, 'Review not found');

  review.isApproved = req.body.isApproved;
  await review.save();
  const summary = await recomputeProductRating(review.product);

  res.json({
    success: true,
    message: review.isApproved ? 'Review approved.' : 'Review hidden.',
    data: review.toJSON(),
    meta: { summary },
  });
});

/** DELETE /api/admin/reviews/:id â€” hard delete (moderation cleanup). */
exports.deleteReview = asyncHandler(async (req, res) => {
  requireDB();
  if (!mongoose.isValidObjectId(req.params.id)) throw fail(400, 'Invalid review id');

  const review = await Review.findById(req.params.id);
  if (!review) throw fail(404, 'Review not found');

  const productId = review.product;
  await review.deleteOne();
  const summary = await recomputeProductRating(productId);

  res.json({ success: true, message: 'Review deleted.', meta: { summary } });
});
