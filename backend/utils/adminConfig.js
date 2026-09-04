/**
 * utils/adminConfig.js — single source of truth for Admin-phase business rules.
 * The low-stock threshold lives ONLY here (directive §13); the admin UI reads it
 * from GET /api/admin/meta instead of re-hard-coding it.
 */
'use strict';

module.exports = {
  /** Products at or below this quantity (but > 0) are "Low Stock". */
  LOW_STOCK_THRESHOLD: Number(process.env.ADMIN_LOW_STOCK_THRESHOLD || 5),

  /**
   * Allowed order-status transitions for admins. Prevents impossible jumps
   * (e.g. delivered → pending). Cancelling is allowed from the same states as
   * user cancellation; cancelling restores stock exactly like the user flow.
   */
  ADMIN_STATUS_TRANSITIONS: {
    pending: ['confirmed', 'cancelled'],
    confirmed: ['processing', 'shipped', 'cancelled'],
    processing: ['shipped', 'cancelled'],
    shipped: ['delivered'],
    delivered: [],
    cancelled: [],
  },
};
