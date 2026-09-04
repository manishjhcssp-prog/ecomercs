/**
 * genAdminShells.js ??? regenerate the five admin HTML shells from one template.
 * Single source of truth so no hand-edit drift can ever recur.
 * Usage: node scripts/genAdminShells.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const V = '20260910a';
const PAGES = {
  index: 'Dashboard',
  products: 'Products',
  inventory: 'Inventory',
  orders: 'Orders',
  reviews: 'Reviews',
  users: 'Users',
};

const TEMPLATE = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex">
  <title>__TITLE__ ?? NovaMart Admin</title>
  <link rel="stylesheet" href="css/admin.css?v=${V}">
</head>
<body class="a-body" data-page="__PAGE__">
  <div id="admin-root">
    <div style="padding:40px;font-family:system-ui,sans-serif;color:#444">Loading admin interface???</div>
  </div>
  <script>window.__BOOT_LOG = ['html-parsed'];</script>
  <script src="js/admin-core.js?v=${V}"></script>
  <script src="js/admin.js?v=${V}"></script>
  <script>
    window.setTimeout(function () {
      var r = document.getElementById('admin-root');
      if (r && !r.dataset.booted && !window.__BOOT_HANDLED) {
        var L = (window.__BOOT_LOG || []).join(' -> ') || '(empty)';
        var n = (window.__BOOT_LOG || []).length;
        var why =
          n >= 3 ? 'Both scripts ran, but boot() itself failed.' :
          n === 2 ? 'admin-core.js OK, but admin.js failed to run.' :
          n === 1 ? 'admin-core.js failed to run.' :
          'Even the first inline script did not run.';
        r.innerHTML = '<div style="max-width:680px;margin:60px auto;padding:24px;border:2px solid #b02a37;' +
          'border-radius:12px;font-family:system-ui,sans-serif;color:#222">' +
          '<h3 style="margin-top:0;color:#b02a37">Admin UI failed to start</h3>' +
          '<p><b>Stopped at:</b> ' + L + '</p><p>' + why + '</p>' +
          '<p>Try an Incognito window (Ctrl+Shift+N). Still failing? Press F12 &rarr; Console ' +
          'and share every red error line.</p></div>';
      }
    }, 2500);
  </script>
</body>
</html>
`;

const dir = path.join(__dirname, '..', '..', 'frontend', 'admin');
for (const [page, title] of Object.entries(PAGES)) {
  const html = TEMPLATE.replace('__TITLE__', title).replace('__PAGE__', page);
  fs.writeFileSync(path.join(dir, page + '.html'), html, 'utf8');
  console.log('written', page + '.html');
}
console.log('version', V);
