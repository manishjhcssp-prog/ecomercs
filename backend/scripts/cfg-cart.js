/* Scenario: logged-in customer opens the cart page; server returns a cart with items. */
module.exports = {
  page: 'cart',
  expectBoot: true,
  auth: { token: 'harness-token', user: { id: 'u9', name: 'Cust', role: 'user' } },
  expect: ['Aurora Headphones', 'Nimbus Keyboard', 'Order Summary'],
  api: {
    '/cart': {
      success: true,
      data: {
        items: [
          { product: { id: 'p1', name: 'Aurora Headphones', price: 2499, stock: 8, image: '' }, quantity: 2 },
          { product: { id: 'p2', name: 'Nimbus Keyboard', price: 1799, stock: 3, image: '' }, quantity: 1 },
        ],
        itemCount: 3,
        subtotal: 6797,
      },
    },
    '/auth/me': { success: true, data: { id: 'u9', role: 'user', name: 'Cust' } },
    '/users/addresses': {
      success: true,
      data: [{ id: 'a1', label: 'Home', line1: '12 MG Road', city: 'Bengaluru', pin: '560001', isDefault: true }],
    },
  },
};
