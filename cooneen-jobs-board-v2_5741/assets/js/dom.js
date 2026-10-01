/* Tiny DOM helpers.
   Every piece of text goes in through textContent: nothing in this app ever builds markup from a string. */

const SVG_NS = 'http://www.w3.org/2000/svg';

export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = text;
  return node;
}

export function svgEl(tag, attrs) {
  const node = document.createElementNS(SVG_NS, tag);
  if (attrs) Object.keys(attrs).forEach((k) => node.setAttribute(k, String(attrs[k])));
  return node;
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

/* 24x24 line icons (stroke = currentColor). Each entry is a list of [shape, data]. */
const ICONS = {
  pin: [['path', 'M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z'], ['circle', { cx: 12, cy: 10, r: 3 }]],
  team: [['path', 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2'], ['circle', { cx: 9, cy: 7, r: 4 }],
    ['path', 'M23 21v-2a4 4 0 0 0-3-3.87'], ['path', 'M16 3.13a4 4 0 0 1 0 7.75']],
  tag: [['path', 'M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z'], ['path', 'M7 7h.01']],
  calendar: [['rect', { x: 3, y: 4, width: 18, height: 18, rx: 2 }], ['path', 'M16 2v4M8 2v4M3 10h18']],
  clock: [['circle', { cx: 12, cy: 12, r: 10 }], ['path', 'M12 6v6l4 2']],
  star: [['path', 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z']],
  bolt: [['path', 'M13 2L3 14h9l-1 8 10-12h-9l1-8z']],
  home: [['path', 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z'], ['path', 'M9 22V12h6v10']],
  pause: [['rect', { x: 6, y: 4, width: 4, height: 16 }], ['rect', { x: 14, y: 4, width: 4, height: 16 }]],
  play: [['path', 'M6 3l14 9-14 9V3z']],
  prev: [['path', 'M15 18l-6-6 6-6']],
  next: [['path', 'M9 18l6-6-6-6']],
  alert: [['path', 'M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z'],
    ['path', 'M12 9v4M12 17h.01']],
  expand: [['path', 'M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3']],
  arrow: [['path', 'M5 12h14M13 6l6 6-6 6']]
};

export function icon(name, className) {
  const svg = svgEl('svg', {
    viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false', class: 'ico' + (className ? ' ' + className : '')
  });
  (ICONS[name] || []).forEach((part) => {
    const data = part[1];
    svg.appendChild(typeof data === 'string' ? svgEl(part[0], { d: data }) : svgEl(part[0], data));
  });
  return svg;
}
