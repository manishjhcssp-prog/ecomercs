/**
 * dev-server.js — development-only static file server for the frontend.
 *
 * Purpose: let you preview the NovaMart storefront locally without installing
 * anything (no npm packages required). NOT part of the e-commerce app itself;
 * production serving/deployment will replace this later.
 *
 * Usage:  node dev-server.js          → http://127.0.0.1:5500
 * Port can be overridden:  PORT=8080 node dev-server.js
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.normalize(path.join(__dirname, 'frontend'));
const PORT = Number(process.env.PORT) || 5500;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
};

http.createServer((req, res) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    res.writeHead(400);
    return res.end('Bad request');
  }

  if (pathname.endsWith('/')) pathname += 'index.html';

  const file = path.normalize(path.join(ROOT, pathname));
  if (file !== ROOT && !file.startsWith(ROOT + path.sep)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('Not found: ' + pathname);
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store', // dev only: never let the browser cache anything
    });
    res.end(data);
  });
}).listen(PORT, '127.0.0.1', () => {
  console.log(`NovaMart frontend serving at http://127.0.0.1:${PORT}`);
});
