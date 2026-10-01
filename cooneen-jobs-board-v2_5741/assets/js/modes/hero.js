/* Hero: one vacancy per screen, as large as it can be - the Cooneen heading, the job title, where and what, the role
   overview in full, and a QR code to the vacancy page. It rotates automatically through EVERY open vacancy
   (each for ?rotation= seconds, default 40) and only stays put when there is a single vacancy or ?job= pins one.
   Order: the ?sort= order by default (see ?hero= for the alternatives). */

import { mountSlideshow } from '../slideshow.js';
import { heroSequence } from '../vacancies.js';
import { createFeature, fitFeature } from '../components.js';

export function mount(ctx) {
  return mountSlideshow(ctx, {
    name: 'hero',
    size: 1,
    sequence: heroSequence,
    create: (group, c) => createFeature(group[0], c, 'hero'),
    fit: fitFeature
  });
}
