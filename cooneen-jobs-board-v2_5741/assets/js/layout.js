/* Layout engine for the wall (and kiosk) display.
   Pure arithmetic: give it the space available and the number of vacancies, get back a grid.

   - ?columns / ?rows win when given; otherwise the grid comes from the screen shape and ?cardsize.
   - When a column count is given without rows, the number of rows is chosen so cards keep a sensible shape.
   - With QR codes on, cards carry a QR "stub" beside the text, so the automatic grid has fewer, wider cards.
   - With large text (?fontscale above 1.2) the automatic grid has fewer, bigger cards, so the text can grow.
   - More vacancies than fit on a page -> several pages, split as evenly as possible (13 over 3 pages is
     5 + 4 + 4, never 6 + 6 + 1).
   - Few vacancies -> fewer, bigger cards (capped, so one vacancy does not become a giant), centred.
   - Every card on every page gets the same size, so nothing jumps when pages change.
   - c is the card's own scale (card design box is 520 x 380, or 700 x 380 with a QR stub) which drives all
     text inside the card. */

const AUTO_GRID = {
  landscape: { small: [4, 3], medium: [3, 2], large: [2, 1] },
  portrait: { small: [3, 4], medium: [2, 3], large: [1, 2] }
};
const AUTO_GRID_QR = {
  landscape: { small: [3, 2], medium: [2, 2], large: [2, 1] },
  portrait: { small: [2, 4], medium: [1, 3], large: [1, 2] }
};
const CARD_DESIGN_W = 520;
const CARD_DESIGN_W_QR = 700;
const CARD_DESIGN_H = 380;
const MAX_GROWTH = 1.45;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function computeWallLayout(o) {
  const n = Math.max(0, Math.floor(o.n || 0));
  const gap = Math.max(0, o.gap || 0);
  const areaW = Math.max(1, o.areaW);
  const areaH = Math.max(1, o.areaH);
  const table = o.qr ? AUTO_GRID_QR : AUTO_GRID;
  const grid = table[o.orientation === 'portrait' ? 'portrait' : 'landscape'][o.cardsize] || table.landscape.medium;
  const big = o.fontscale > 1.2 ? o.fontscale : 1;       /* large text: fewer, bigger cards (automatic grids only) */

  let cols = o.columns > 0 ? o.columns : Math.max(1, Math.round(grid[0] / big));
  let rows;
  if (o.rows > 0) {
    rows = o.rows;
  } else if (o.columns > 0) {
    const targetAspect = o.qr ? (o.orientation === 'portrait' ? 1.9 : 2.2) : (o.orientation === 'portrait' ? 1.0 : 1.45);
    const colW = (areaW - (cols - 1) * gap) / cols;
    rows = Math.round((areaH + gap) / (colW / targetAspect + gap));
  } else {
    rows = Math.max(1, Math.round(grid[1] / big));
  }
  cols = clamp(Math.round(cols), 1, 10);
  rows = clamp(Math.round(rows), 1, 10);

  const perPage = cols * rows;
  const pages = n === 0 ? 1 : Math.ceil(n / perPage);
  const sizes = [];
  const base = Math.floor(n / pages);
  const extra = n % pages;
  for (let i = 0; i < pages; i += 1) sizes.push(base + (i < extra ? 1 : 0));

  const biggest = Math.max(1, sizes.reduce((a, b) => Math.max(a, b), 0));
  const colsUsed = Math.min(cols, biggest);
  const rowsUsed = Math.ceil(biggest / colsUsed);

  const nominalW = (areaW - (cols - 1) * gap) / cols;
  const nominalH = (areaH - (rows - 1) * gap) / rows;
  const cardW = Math.max(1, Math.min((areaW - (colsUsed - 1) * gap) / colsUsed, nominalW * MAX_GROWTH));
  const cardH = Math.max(1, Math.min((areaH - (rowsUsed - 1) * gap) / rowsUsed, nominalH * MAX_GROWTH));
  const c = Math.min(cardW / (o.qr ? CARD_DESIGN_W_QR : CARD_DESIGN_W), cardH / CARD_DESIGN_H);

  return { cols, rows, perPage, pages, sizes, colsUsed, rowsUsed, cardW, cardH, gap, c };
}

/* Cut a list into the page sizes computed above. */
export function sliceIntoPages(list, sizes) {
  const out = [];
  let at = 0;
  sizes.forEach((size) => { out.push(list.slice(at, at + size)); at += size; });
  return out;
}
