'use strict';

const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '..', 'frontend');
const dest = path.join(__dirname, '..', 'public');

if (fs.existsSync(src)) {
  fs.mkdirSync(dest, { recursive: true });
  fs.cpSync(src, dest, { recursive: true });
  console.log('[build] Successfully synced frontend to public for Vercel static serving.');
} else {
  console.warn('[build] Warning: frontend directory not found.');
}
