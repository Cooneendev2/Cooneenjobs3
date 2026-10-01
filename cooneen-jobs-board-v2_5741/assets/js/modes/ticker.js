/* Ticker: a continuous scrolling "Now hiring" strip, built to sit along the bottom of a screen
   (give it a short, wide zone, for example 1920 x 120 in Yodeck).
   Scroll speed is constant however many vacancies there are. If the device asks for reduced motion
   (and ?motion=full is not set) it shows one vacancy at a time instead of scrolling. */

import { el, clear, icon } from '../dom.js';
import { shortLocation } from '../vacancies.js';
import { createRotator } from '../rotator.js';
import { createBrandPlate } from '../components.js';

const BASE_SPEED = 90; /* design pixels per second at ?speed=1 */

export function mount(ctx) {
  const { app, cfg, i18n, stage } = ctx;
  const t = i18n.t;
  const root = el('div', 'mode mode-ticker');
  app.appendChild(root);

  const bar = el('div', 'ticker');
  bar.setAttribute('role', 'region');
  bar.setAttribute('aria-label', t('tickerLabel'));
  /* Cooneen logo (when the strip is wide enough for it), then INTERNAL VACANCIES, then the scrolling vacancies. */
  const plate = createBrandPlate(ctx);
  const label = el('div', 'ticker-label');
  label.appendChild(el('span', null, cfg.title || t('title')));
  const viewport = el('div', 'ticker-viewport');
  const track = el('div', 'ticker-track');
  viewport.appendChild(track);
  const warn = el('div', 'ticker-warn');
  warn.hidden = true;
  bar.appendChild(plate);
  bar.appendChild(label);
  bar.appendChild(viewport);
  bar.appendChild(warn);
  root.appendChild(bar);

  let view = null;
  let single = null;
  let singleIndex = 0;
  const timers = new Set();
  const rotator = createRotator(() => {
    if (!view || !view.items.length) return;
    singleIndex = (singleIndex + 1) % view.items.length;
    showSingle(true);
  });

  function itemNode(item) {
    const node = el('span', 'tk-item');
    node.appendChild(el('span', 'tk-title', item.job.title));
    if (cfg.showLocation && item.job.location) node.appendChild(el('span', 'tk-loc', shortLocation(item.job.location, cfg.fullLocation)));
    item.badges.forEach((kind) => {
      if (kind === 'featured' && !cfg.showFeatured) return;
      const key = kind === 'closing' ? 'badgeClosing' : kind === 'featured' ? 'badgeFeatured' : 'badgeNew';
      node.appendChild(el('span', 'tk-tag tk-tag-' + kind, t(key)));
    });
    return node;
  }

  function group(copies, hidden) {
    const g = el('div', 'tk-group');
    if (hidden) g.setAttribute('aria-hidden', 'true');
    for (let c = 0; c < copies; c += 1) {
      view.items.forEach((item) => {
        g.appendChild(itemNode(item));
        g.appendChild(el('span', 'tk-sep'));
      });
    }
    return g;
  }

  function scroll() {
    clear(track);
    track.style.removeProperty('animation-duration');
    track.classList.remove('is-static');
    const first = group(1, false);
    track.appendChild(first);
    const unit = first.getBoundingClientRect().width;      /* includes the stage scale / rotation */
    const unitLayout = first.offsetWidth;                  /* layout pixels, unaffected by rotation */
    const need = Math.max(1, Math.ceil(viewport.clientWidth / Math.max(1, unitLayout)));
    if (need > 1) {
      clear(track);
      track.appendChild(group(need, false));
    }
    track.appendChild(group(need, true));
    const groupWidth = track.firstChild.offsetWidth;
    const pxPerSecond = BASE_SPEED * stage.info.s * cfg.speed;
    const seconds = Math.max(8, groupWidth / pxPerSecond);
    track.style.setProperty('animation-duration', seconds.toFixed(2) + 's');
    return unit;
  }

  function showSingle(animate) {
    clear(track);
    track.classList.add('is-static');
    const item = view.items[singleIndex % view.items.length];
    const holder = el('div', 'tk-single');
    holder.appendChild(itemNode(item));
    track.appendChild(holder);
    if (animate) {
      holder.classList.add('is-in');
      const id = window.setTimeout(() => { timers.delete(id); holder.classList.remove('is-in'); }, 30);
      timers.add(id);
    }
  }

  function draw() {
    rotator.stop();
    if (view.status !== 'ok') {
      clear(track);
      track.classList.add('is-static');
      const msg = el('div', 'tk-single');
      const textKey = view.status === 'empty' ? 'emptyTitle' : view.status === 'failed' ? 'errorTitle' : 'loadingTitle';
      msg.appendChild(el('span', 'tk-note', t(textKey)));
      track.appendChild(msg);
      return;
    }
    if (ctx.reducedMotion) {
      singleIndex = 0;
      showSingle(false);
      if (view.items.length > 1) rotator.start(5000);
    } else {
      scroll();
    }
  }

  /* The logo only when the strip is wide enough for it as well as the scrolling vacancies. */
  function placePlate() { plate.hidden = stage.info.W / stage.info.s < 1700; }

  function showHealth() {
    const h = view.health;
    const bad = h === 'offline' || h === 'saved' || h === 'stale' || h === 'old';
    warn.hidden = !bad;
    clear(warn);
    if (bad) {
      warn.appendChild(icon('alert'));
      warn.appendChild(el('span', null, i18n.time(view.dataTimeMs)));
      warn.title = h === 'old' ? t('statusOld', { date: i18n.dateTime(view.dataTimeMs) }) : t('statusOffline', { time: i18n.time(view.dataTimeMs) });
    }
  }

  return {
    update(v) { view = v; placePlate(); showHealth(); draw(); },
    resize() { placePlate(); if (view) draw(); },
    refit() { if (view && view.status === 'ok' && !ctx.reducedMotion) scroll(); },
    tick() {},
    hold(reason, on) { if (on) rotator.hold(reason); else rotator.release(reason); },
    info() { return { mode: 'ticker', items: view ? view.items.length : 0, scrolling: !ctx.reducedMotion }; },
    destroy() {
      rotator.destroy();
      timers.forEach((id) => window.clearTimeout(id));
      timers.clear();
      root.remove();
    }
  };
}
