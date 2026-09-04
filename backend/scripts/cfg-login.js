/* Scenario: logged-out admin page, then submit the login form with real admin creds. */
module.exports = {
  page: 'index',
  expectBoot: false,
  login: { email: 'admin@novamart.dev', password: 'Admin!2345' },
  api: {
    '/auth/login': {
      success: true,
      data: {
        token: 'fake-token-for-harness',
        user: { id: 'u1', role: 'admin', name: 'Store Admin', email: 'admin@novamart.dev' },
      },
    },
    '/auth/me': { success: true, data: { id: 'u1', role: 'admin', name: 'Store Admin' } },
  },
};
