/**
 * scripts/fixEncoding.js — mojibake repair v2 (table-based).
 *
 * Files contain mixed single/double cp1252-misencoded UTF-8 stored as literal
 * text (e.g. ₹ → â‚¹, — → Ã¢â‚¬â€). Strategy: ordered literal replacements
 * (longest first), applied repeatedly to a fixpoint, then targeted cleanups.
 * Idempotent and safe to re-run; files with no matches are untouched.
 */
'use strict';
const fs = require('fs');
const path = require('path');

// Ordered longest-first so specific multi-char sequences win over prefixes.
const MAP = [
  // double-encoded punctuation
  ['\u00C3\u00A2\u00E2\u201A\u00AC\u00CB\u0153', '\u2018'], // Ã¢â‚¬Ëœ → '
  ['\u00C3\u00A2\u00E2\u201A\u00AC\u2122', '\u2019'],       // Ã¢â‚¬â„¢ → '
  ['\u00C3\u00A2\u00E2\u201A\u00AC\u00C2\u00A6', '\u2026'], // Ã¢â‚¬Â¦ → …
  ['\u00C3\u00A2\u00E2\u201A\u00AC\u201C', '\u201C'],       // Ã¢â‚¬Å“ → "
  ['\u00C3\u00A2\u00E2\u201A\u00AC\u00C2\u009D', '\u201D'], // Ã¢â‚¬Â\x9D → "
  ['\u00C3\u00A2\u00E2\u201A\u00AC\u201C\u201C', '\u2013'], // safety variant
  ['\u00C3\u00A2\u00E2\u201A\u00AC\u201D', '\u2014'],       // Ã¢â‚¬â€� → —
  ['\u00C3\u00A2\u00E2\u201A\u00AC\u201C', '\u2013'],       // Ã¢â‚¬â€œ → –
  ['\u00C3\u00A2\u00E2\u201A\u00AC\u201D', '\u2014'],       // Ã¢â‚¬â€� → — (dup-safe)
  ['\u00C3\u00A2\u00E2\u201A\u00AC\u201D', '\u2014'],
  ['\u00C3\u00A2\u00E2\u201A\u00AC\u201C', '\u2013'],
  ['\u00C3\u00A2\u00E2\u201A\u00AC', '\u2014'],             // bare Ã¢â‚¬â€ tail → —
  ['\u00C3\u00A2\u00E2\u201A\u00AC', '\u2013'],
  ['\u00C3\u00A2\u00E2\u201A\u00AC\u00CB\u0153', '\u2018'],
  ['\u00C3\u00A2\u00E2\u201A\u00AC\u2122', '\u2019'],
  ['\u00C3\u201A\u00C2\u00A9', '\u00A9'],                   // Ã‚Â© → ©
  ['\u00C3\u201A\u00C2\u00B7', '\u00B7'],                   // Ã‚Â· → ·
  ['\u00E2\u20AC\u00B9', '\u2039'],
  ['\u00E2\u20AC\u00BA', '\u203A'],
  ['\u00C2\u00B7', '\u00B7'],                                // Â· → ·
  ['\u00C3\u00A2\u20AC\u017E\u00C2\u00A2', '\u2122'],       // Ã¢â€žÂ¢ → ™
  // single-encoded symbols
  ['\u00E2\u201A\u00B9', '\u20B9'],                          // â‚¹ → ₹
  ['\u00E2\u02DC\u2026', '\u2605'],                          // â˜… → ★
  ['\u00E2\u02DC\u2020', '\u2606'],                          // â˜† → ☆
  ['\u00E2\u20AC\u201C', '\u2013'],                          // â€“ → –
  ['\u00E2\u20AC\u201D', '\u2014'],                          // â€" → —
  ['\u00E2\u20AC\u0153', '\u201C'],                          // â€œ → "
  ['\u00E2\u20AC\u2122', '\u2019'],                          // â€™ → '
  ['\u00E2\u20AC\u02DC', '\u2018'],                          // â€˜ → '
  ['\u00E2\u20AC\u00A6', '\u2026'],                          // â€¦ → …
  ['\u00E2\u20AC\u009D', '\u201D'],                          // â€\x9D → "
  ['\u00E2\u20AC\u0094', '\u2014'],
  ['\u00E2\u20AC\u0093', '\u2013'],
  ['\u00E2\u20AC\u00A2', '\u2022'],                          // â€¢ → •
  ['\u00E2\u201A\u00AC', '\u20AC'],                          // â‚¬ → €
  ['\u00C2\u00A9', '\u00A9'],                                // Â© → ©
  ['\u00C2\u00AE', '\u00AE'],
  ['\u00C2\u00B0', '\u00B0'],
  ['\u00C2\u00BD', '\u00BD'],
  ['\u00C2\u00A0', ' '],                                     // Â  → space
];

function clean(text) {
  let cur = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < 6; i++) {
    let next = cur;
    for (const [from, to] of MAP) next = next.split(from).join(to);
    // leftover Â directly before space/punctuation → drop
    next = next.replace(/\u00C2(?=[\s,.:;!?\-)\]}>&|])/g, '');
    if (next === cur) break;
    cur = next;
  }
  return cur;
}

let changed = 0;
function handle(target) {
  const stat = fs.statSync(target);
  if (stat.isDirectory()) {
    for (const entry of fs.readdirSync(target)) {
      if (/^(\.git|node_modules)$/.test(entry)) continue;
      handle(path.join(target, entry));
    }
    return;
  }
  if (!/\.(html|js|css)$/.test(target)) return;
  const src = fs.readFileSync(target, 'utf8');
  const out = clean(src);
  if (out !== src) {
    fs.writeFileSync(target, out);
    changed++;
    const rel = path.relative(process.cwd(), target);
    console.log(`repaired ${rel}`);
  }
}

handle(path.join(__dirname, '..', '..', 'frontend'));
handle(path.join(__dirname, 'genAdminShells.js'));
handle(path.join(__dirname, 'uiSmokeTest.js'));
console.log(`\n${changed} file(s) repaired.`);
