/* Colour-contrast check for every theme (WCAG 2.x). Reads the tokens straight from assets/css/themes.css, so a new
   or edited theme is checked automatically:   node --no-warnings tests/contrast.mjs
   Text needs 4.5:1 (large bold text 3:1 is also accepted where noted); icons, focus rings and progress need 3:1. */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'css', 'themes.css'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '');

const themes = {};
const re = /:root((?:\s*,\s*:root)?\[data-theme="(\w+)"\]|)\s*\{([^}]*)\}/g;
let m;
while ((m = re.exec(css))) {
  const name = m[2] || 'cooneen';
  const tokens = {};
  m[3].split(';').forEach((decl) => {
    const i = decl.indexOf(':');
    if (i > 0) tokens[decl.slice(0, i).trim().replace(/^--/, '')] = decl.slice(i + 1).trim();
  });
  themes[name] = tokens;
}
/* ":root, :root[data-theme="cooneen"]" is matched by the group above with name cooneen */

function rgb(value) {
  const v = String(value || '').trim();
  let r = /^#([0-9a-f]{6})$/i.exec(v);
  if (r) return [0, 2, 4].map((i) => parseInt(r[1].slice(i, i + 2), 16));
  r = /^#([0-9a-f]{3})$/i.exec(v);
  if (r) return [0, 1, 2].map((i) => parseInt(r[1][i] + r[1][i], 16));
  return null;                                  // transparent / rgba: decorative tokens are not checked
}
const lin = (c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const ratio = (a, b) => { const x = lum(a); const y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const mix = (fg, bg, alpha) => fg.map((c, i) => Math.round(c * alpha + bg[i] * (1 - alpha)));

/* [foreground token, background token, minimum ratio, what it is] */
const PAIRS = [
  ['on-bg', 'bg-1', 4.5, 'text on the screen background'], ['on-bg', 'bg-2', 4.5, 'text on the screen background (lower edge)'],
  ['on-bg-2', 'bg-1', 4.5, 'secondary text on the background'], ['on-bg-2', 'bg-2', 4.5, 'secondary text (lower edge)'],
  ['accent', 'bg-1', 4.5, 'brand / "Now hiring" text on the background'], ['accent', 'bg-2', 4.5, 'brand text (lower edge)'],
  ['ink', 'surface', 4.5, 'card text'], ['ink-2', 'surface', 4.5, 'card secondary text'],
  ['accent-ink', 'surface', 3, 'card icons'],
  ['on-accent', 'accent', 4.5, 'text on accent fill'], ['on-gold', 'gold', 4.5, 'Featured badge'],
  ['on-warn', 'warn', 4.5, 'Closing soon badge'], ['on-new', 'new', 4.5, 'New badge'],
  ['warn-ink', 'surface', 4.5, '"Closes today" text on a card'],
  ['warn-text', 'bg-1', 4.5, 'warning text on the background'], ['warn-text', 'bg-2', 4.5, 'warning text (lower edge)'],
  ['ticker-ink', 'ticker-bg', 4.5, 'ticker text'], ['ticker-label-ink', 'ticker-label-bg', 4.5, 'ticker label'],
  ['ticker-warn', 'ticker-bg', 4.5, 'ticker warning icon / time'],
  ['on-bg', 'panel', 4.5, 'duo panel text'], ['on-bg-2', 'panel', 4.5, 'duo panel secondary text'],
  ['accent', 'panel', 4.5, 'duo panel icons / accent'], ['warn-text', 'panel', 4.5, 'duo panel warning text'],
  ['hdr-ink', 'hdr-bg', 4.5, 'INTERNAL VACANCIES lettering, vacancy count and clock on the heading band'],
  ['plate-dark-ink', 'plate-dark', 4.5, 'wordmark on the dark logo plate'], ['plate-light-ink', 'plate-light', 4.5, 'wordmark on the light logo plate'],
  ['qr-edge', 'bg-1', 3, 'QR frame on the background'], ['qr-edge', 'panel', 3, 'QR frame on a duo panel'],
  ['focus', 'bg-1', 3, 'focus ring on the background'], ['focus-s', 'surface', 3, 'focus ring on a card or list row'],
  ['accent', 'seg-bg-solid', 3, 'paging progress']
];
/* ticker location text is drawn at 80% opacity */
const EXTRA = (t) => [[mix(rgb(t['ticker-ink']), rgb(t['ticker-bg']), 0.8), rgb(t['ticker-bg']), 4.5, 'ticker location text (80% opacity)']];

let failed = 0;
let checked = 0;
Object.keys(themes).forEach((name) => {
  const t = themes[name];
  const solid = Object.assign({}, t);
  const bg = rgb(t['bg-1']);
  const segRaw = /rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/.exec(t['seg-bg'] || '');
  if (segRaw && bg) solid['seg-bg-solid'] = '#' + mix([+segRaw[1], +segRaw[2], +segRaw[3]], bg, +segRaw[4]).map((c) => c.toString(16).padStart(2, '0')).join('');
  else solid['seg-bg-solid'] = t['seg-bg'];
  const rows = PAIRS.map(([f, b, min, what]) => [rgb(solid[f]), rgb(solid[b]), min, what + ' (' + f + ' on ' + b + ')']).concat(EXTRA(t).map((r) => [r[0], r[1], r[2], r[3]]));
  rows.forEach(([f, b, min, what]) => {
    if (!f || !b) { console.log('FAIL ' + name + ': cannot read colours for ' + what); failed += 1; return; }
    const r = ratio(f, b);
    checked += 1;
    if (r + 1e-9 < min) { failed += 1; console.log('FAIL ' + name + ': ' + what + ' is ' + r.toFixed(2) + ':1, needs ' + min + ':1'); }
  });
});
console.log(Object.keys(themes).length + ' themes (' + Object.keys(themes).join(', ') + '), ' + checked + ' colour pairs checked, ' + failed + ' below target');
process.exit(failed ? 1 : 0);
