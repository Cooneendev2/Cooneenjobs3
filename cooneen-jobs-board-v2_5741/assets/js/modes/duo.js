/* Duo: two vacancies side by side (one above the other on a portrait screen), equal size, tuned for a 16:9 signage pane.
   For every pair: title, facts, the role overview and a QR code. The screen changes by itself, pairing the vacancies in
   order - 1+2, 3+4, 5+6, ... - so every vacancy is shown in every cycle. With an odd number the last screen is
   completed with the first vacancy again. Each screen stays up for ?rotation= seconds (default 40). */

import { mountSlideshow } from '../slideshow.js';
import { createDuoPanel, fitDuo } from '../components.js';
import { el } from '../dom.js';

export function mount(ctx) {
  return mountSlideshow(ctx, {
    name: 'duo',
    size: 2,
    sequence: (items) => ({ items, reason: 'sort order, two per screen' }),
    create(group, c) {
      const root = el('div', 'duo' + (group.length === 1 ? ' duo-single' : ''));
      const panels = group.map((item) => {
        const p = createDuoPanel(item, c);
        root.appendChild(p.root);
        return p;
      });
      return { root, panels };
    },
    fit: (parts) => fitDuo(parts.panels)
  });
}
