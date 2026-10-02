/* Wall (and kiosk): several vacancies at once as a grid of cards, paging automatically if there are more
   than fit on one screen. The grid, card size and text scale all come from layout.js. */

import { el, clear } from '../dom.js';
import { computeWallLayout, sliceIntoPages } from '../layout.js';
import {
  createHeader, createStatus, createControls, createCard, fitCards, createStatePanel, buildPager
} from '../components.js';
import { createRotator } from '../rotator.js';

export function mount(ctx) {
  const { app, cfg, stage } = ctx;
  const root = el('div', 'mode mode-wall');
  app.appendChild(root);

  const header = cfg.header ? createHeader(ctx) : null;
  if (header) root.appendChild(header.el);

  const area = el('main', 'wall-area');
  const pageEl = el('div', 'wall-page');
  const stateHost = el('div', 'state-host');
  stateHost.hidden = true;
  area.appendChild(pageEl);
  area.appendChild(stateHost);
  root.appendChild(area);

  const foot = el('footer', 'foot');
  const pager = el('div', 'pager');
  const status = createStatus(ctx);
  foot.appendChild(pager);
  foot.appendChild(status.el);
  root.appendChild(foot);

  let view = null;
  let layout = null;
  let pages = [];
  let pageIndex = 0;
  let paused = false;
  let controls = null;
  let bar = null;                       /* the progress bar: follows the rotator's clock */
  const timers = new Set();

  function later(fn, ms) {
    const id = window.setTimeout(() => { timers.delete(id); fn(); }, ms);
    timers.add(id);
  }

  const rotator = createRotator(() => go(1, false), syncBar);

  function syncBar() { if (bar) bar.sync(rotator.state()); }
  /* Start the bar for page `index` (empty, filling) at the same moment the countdown for it starts. */
  function startBar(index) {
    bar = buildPager(pager, pages.length, index, cfg.rotation, !ctx.reducedMotion);
    syncBar();
  }

  if (cfg.controls) {
    controls = createControls(ctx, {
      prev: () => go(-1, true),
      next: () => go(1, true),
      toggle: () => togglePause()
    });
    foot.appendChild(controls.el);
  }

  function showState(kind) {
    rotator.stop();
    pages = [];
    bar = null;
    clear(pageEl);
    clear(stateHost);
    pager.hidden = true;
    pageEl.hidden = true;
    stateHost.hidden = false;
    stateHost.appendChild(createStatePanel(kind, ctx));
  }

  function build(index) {
    if (!pages[index]) return;        /* the data may have changed during the page fade */
    clear(pageEl);
    const qrPx = cfg.qr ? 150 * layout.c * cfg.fontscale : 0;
    const nodes = [];
    const items = pages[index];
    /* One row element per grid row: cards never wrap by accident, whatever the rounding. */
    for (let i = 0; i < items.length; i += layout.colsUsed) {
      const row = el('div', 'wall-row');
      items.slice(i, i + layout.colsUsed).forEach((item) => {
        const card = createCard(item, ctx, { qrPx });
        row.appendChild(card);
        nodes.push(card);
      });
      pageEl.appendChild(row);
    }
    fitCards(nodes);
  }

  /* The progress bar moves on at once (the old bar is full at that moment); the page itself fades over 0.4 s. */
  function renderPage(index, animate) {
    if (!pages[index]) return;
    startBar(index);
    if (animate && !ctx.reducedMotion) {
      pageEl.classList.add('is-out');
      later(() => { build(index); pageEl.classList.remove('is-out'); }, 380);
    } else {
      pageEl.classList.remove('is-out');
      build(index);
    }
  }

  function relayout(keepPage) {
    clear(stateHost);
    stateHost.hidden = true;
    pageEl.hidden = false;
    const gap = cfg.gap * stage.info.s;
    layout = computeWallLayout({
      areaW: pageEl.clientWidth, areaH: pageEl.clientHeight, n: view.items.length, qr: cfg.qr, fontscale: cfg.fontscale,
      orientation: stage.info.orientation, columns: cfg.columns, rows: cfg.rows, cardsize: cfg.cardsize, gap
    });
    pageEl.style.setProperty('--card-w', layout.cardW + 'px');
    pageEl.style.setProperty('--card-h', layout.cardH + 'px');
    pageEl.style.setProperty('--c', layout.c + 'px');
    pageEl.style.setProperty('--gap', gap + 'px');
    pages = sliceIntoPages(view.items, layout.sizes);
    if (!keepPage || pageIndex >= pages.length) pageIndex = 0;
    if (pages.length > 1) rotator.start(cfg.rotationMs);     /* the countdown and the bar start together */
    else rotator.stop();
    renderPage(pageIndex, false);
    ctx.announceable = pages.length;
  }

  function go(delta, manual) {
    if (pages.length < 2) return;
    pageIndex = (pageIndex + delta + pages.length) % pages.length;
    if (manual) rotator.restart();      /* a full countdown from now, before the bar is started */
    renderPage(pageIndex, true);
    if (manual) {
      ctx.announce(ctx.i18n.t('pageOf', { page: pageIndex + 1, pages: pages.length }));
    }
  }

  function togglePause() {
    paused = !paused;
    if (paused) rotator.hold('user'); else rotator.release('user');
    ctx.setPaused(paused);
    if (controls) controls.setPaused(paused);
  }

  return {
    update(v) {
      view = v;
      if (header) header.update(v);
      status.update(v);
      if (v.status !== 'ok') { showState(v.status); return; }
      relayout(true);
    },
    resize() { if (view && view.status === 'ok') relayout(true); },
    refit() { if (view && view.status === 'ok') fitCards(Array.prototype.slice.call(pageEl.querySelectorAll('.card'))); },
    tick(now) { if (header) header.tick(now); syncBar(); },
    next() { go(1, true); },
    prev() { go(-1, true); },
    togglePause,
    hold(reason, on) { if (on) rotator.hold(reason); else rotator.release(reason); },
    info() { return { mode: 'wall', pages: pages.length, pageIndex, layout }; },
    destroy() {
      if (header) header.destroy();
      rotator.destroy();
      timers.forEach((id) => window.clearTimeout(id));
      timers.clear();
      root.remove();
    }
  };
}
