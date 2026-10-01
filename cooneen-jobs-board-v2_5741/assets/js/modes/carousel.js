/* Carousel: one vacancy at a time, full screen, rotating on its own with a gentle cross-fade
   (each for ?rotation= seconds, default 40). The title and role overview on the left, a label card with the facts,
   closing date and (optionally) the QR code on the right. */

import { mountSlideshow } from '../slideshow.js';
import { createFeature, fitFeature } from '../components.js';

export function mount(ctx) {
  return mountSlideshow(ctx, {
    name: 'carousel',
    size: 1,
    footer: true,                       /* "3 / 8" counter and, when someone might be at the screen, the paging buttons */
    sequence: (items) => ({ items, reason: 'sort order' }),
    create: (group, c) => createFeature(group[0], c, 'carousel'),
    fit: fitFeature
  });
}
