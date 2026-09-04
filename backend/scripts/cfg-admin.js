module.exports = {
  page: 'index',
  api: {
    '/auth/me': { success: true, data: { id: 'u1', role: 'admin', name: 'Store Admin' } },
    '/admin/meta': { success: true, data: { lowStockThreshold: 5, orderStatuses: ['pending','confirmed'], statusTransitions: {}, productCategories: ['Electronics'] } },
    '/admin/dashboard': { success: true, data: { totalUsers: 8, totalProducts: 15, activeProducts: 13, totalOrders: 6, pendingOrders: 2, processingOrders: 0, shippedOrders: 1, completedOrders: 1, cancelledOrders: 2, totalRevenue: 1234.5, lowStockThreshold: 5, lowStockCount: 1, outOfStockCount: 0, lowStockProducts: [{ id: 'p1', name: 'Low Thing', stock: 3, price: 10, isActive: true }] } },
  },
};
