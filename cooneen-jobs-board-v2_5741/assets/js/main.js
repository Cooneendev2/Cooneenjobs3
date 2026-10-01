/* Start-up: read the URL settings, build the stage, pick the display mode, connect it to the
   vacancy store, and keep it running.

   Architecture in one picture:

     /api/jobs (Pages Function, unchanged) --> store.js  (data layer: fetch, validate, retry, saved copy)
                                                  |
                              vacancies.js (pure: filter, sort, badges, hero order, duo pairing)
                                                  |
        config.js (URL settings)  -->  main.js builds a "view"  -->  modes/<mode>.js  (presentation layer)
        i18n.js (6 languages)           components.js, layout.js, stage.js, qr.js, themes + CSS        */

import { parseConfig } from './config.js';
import { createI18n } from './i18n.js';
import { createStore } from './store.js';
import { createStage } from './stage.js';
import { selectVacancies, signature } from './vacancies.js';
import { createRuntime, createDiag } from './runtime.js';
import { el, clear } from './dom.js';
import * as wall from './modes/wall.js';
import * as carousel from './modes/carousel.js';
import * as hero from './modes/hero.js';
import * as duo from './modes/duo.js';
import * as widget from './modes/widget.js';
import * as ticker from './modes/ticker.js';

const MODES = { wall, carousel, hero, duo, widget, ticker };

function start() {
  const parsed = parseConfig(window.location.search);
  const cfg = parsed.cfg;
  const i18n = createI18n(cfg.lang);

  const html = document.documentElement;
  html.lang = i18n.lang;
  html.setAttribute('data-theme', cfg.theme);
  html.classList.toggle('kiosk', cfg.kiosk);
  document.title = (cfg.title || i18n.t('title')) + ' – ' + i18n.t('brand');

  const stageEl = document.getElementById('stage');
  const app = document.getElementById('app');
  const live = document.getElementById('live');
  const srEl = document.getElementById('sr');
  stageEl.setAttribute('data-mode', cfg.layout);
  stageEl.setAttribute('data-density', cfg.density);

  const reducedMotion = cfg.motion === 'reduced' ||
    (cfg.motion === 'auto' && !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  stageEl.classList.toggle('reduced-motion', reducedMotion);

  const stage = createStage({ stageEl, cfg });
  const store = createStore({ refreshMs: cfg.refreshMs, diag: cfg.diag });

  let userPaused = false;
  let hidden = document.hidden;
  let lastView = null;
  let lastKey = '';
  let lastCount = -1;
  let mode = null;
  let runtime = null;
  let announceTimer = 0;

  function syncPaused() { stageEl.classList.toggle('is-paused', userPaused || hidden); }
  function announce(message) {
    if (!message) return;
    live.textContent = '';
    window.clearTimeout(announceTimer);
    announceTimer = window.setTimeout(() => { live.textContent = message; }, 60);
  }

  const ctx = {
    app, cfg, i18n, stage, store, reducedMotion, links: cfg.links, notes: {},
    announce,
    setPaused(p) { userPaused = p; syncPaused(); }
  };

  /* Screen readers: signage modes rotate on their own, so the visual layer is hidden from assistive
     technology and a complete, static, off-screen list is offered instead. Widget (or ?links=1) stays as is. */
  const visualHidden = cfg.layout !== 'widget' && !cfg.links;

  /* The on-screen buttons (when there are any) must stay reachable, and nothing focusable may sit inside a hidden
     region, so everything except the path down to the buttons is hidden, instead of the whole of #app. */
  function hideVisualLayer() {
    if (!visualHidden) return;
    const buttons = app.querySelector('.controls');
    if (!buttons) { app.setAttribute('aria-hidden', 'true'); return; }
    app.removeAttribute('aria-hidden');
    let node = buttons;
    while (node && node !== app) {
      const parent = node.parentElement;
      if (!parent) break;
      Array.prototype.forEach.call(parent.children, (sibling) => { if (sibling !== node) sibling.setAttribute('aria-hidden', 'true'); });
      node = parent;
    }
  }

  function updateSr(view) {
    clear(srEl);
    if (!visualHidden) return;
    hideVisualLayer();
    srEl.appendChild(el('h1', null, cfg.title || i18n.t('title')));
    if (view.status !== 'ok') {
      const key = view.status === 'failed' ? 'error' : view.status === 'empty' ? 'empty' : 'loading';
      srEl.appendChild(el('p', null, i18n.t(key + 'Title') + (key === 'loading' ? '' : '. ' + i18n.t(key + 'Body'))));
      return;
    }
    const list = el('ul');
    list.setAttribute('aria-label', i18n.t('allListLabel'));
    view.items.forEach((item) => {
      const job = item.job;
      const bits = [job.title];
      if (job.location) bits.push(i18n.t('labelLocation') + ': ' + job.location);
      if (job.department) bits.push(i18n.t('labelDepartment') + ': ' + job.department);
      if (isFinite(job.closingMs)) bits.push(i18n.t('closesOn', { date: i18n.date(job.closingMs) }));
      list.appendChild(el('li', null, bits.join('. ')));
    });
    srEl.appendChild(list);
  }

  function buildView() {
    const now = Date.now();
    const st = store.state;
    let status = 'ok';
    let items = [];
    if (st.phase === 'loading') status = 'loading';
    else if (st.phase === 'failed') status = 'failed';
    else {
      items = selectVacancies(st.jobs, cfg, now);
      if (!items.length) status = 'empty';
    }
    return { status, items, health: store.health(now), dataTimeMs: store.dataTimeMs(), now };
  }

  function render(force) {
    const view = buildView();
    const minute = isFinite(view.dataTimeMs) ? Math.floor(view.dataTimeMs / 60000) : 0;
    const key = view.status + '|' + view.health + '|' + minute + '|' + signature(view.items);
    if (!force && key === lastKey) return;
    lastView = view;
    try {
      mode.update(view);
      updateSr(view);
      ctx.notes.lastRenderError = undefined;
      lastKey = key;            /* only remembered once it worked, so a failed draw is tried again at the next heartbeat */
    } catch (err) {
      lastKey = '';
      ctx.notes.lastRenderError = String(err && err.stack ? err.stack : err).slice(0, 400);
      if (window.console) window.console.error('render failed', err);
      throw err;
    }
    if (view.status === 'ok') {
      if (lastCount !== -1 && view.items.length !== lastCount) announce(i18n.t('count', { n: view.items.length }));
      lastCount = view.items.length;
    }
  }

  mode = MODES[cfg.layout].mount(ctx);

  runtime = createRuntime({
    cfg, store, stage,
    getMode: () => mode,
    onHidden(isHidden) {
      hidden = isHidden;
      syncPaused();
      if (mode && mode.hold) mode.hold('hidden', isHidden);
    },
    onHeartbeat() {
      if (mode && mode.tick) mode.tick(Date.now());
      render(false);
    }
  });
  if (hidden && mode.hold) mode.hold('hidden', true);
  syncPaused();

  if (cfg.diag) {
    const diag = createDiag({
      cfg, issues: parsed.issues, store, stage, host: stageEl, notes: ctx.notes, reducedMotion,
      getMode: () => mode, getView: () => lastView, runtime: () => runtime
    });
    window.__vacancies = { cfg, store, stage, ctx, diag, getMode: () => mode, getView: () => lastView, render, runtime };
  }

  store.subscribe(() => render(false));
  stage.onChange(() => { if (mode.resize) mode.resize(); });

  /* The display font loads on first use; text fitting is redone once it arrives. */
  if (document.fonts) {
    if (document.fonts.addEventListener) document.fonts.addEventListener('loadingdone', () => { if (mode.refit) mode.refit(); });
    if (document.fonts.load) {
      Promise.all([document.fonts.load('400 20px Nunito'), document.fonts.load('800 20px Nunito')]).catch(() => {});
    }
  }

  render(true);       /* shows the loading panel straight away */
  store.start();

  const boot = document.getElementById('boot');
  if (boot) boot.remove();
}

try {
  start();
} catch (err) {
  const boot = document.getElementById('boot');
  if (boot) boot.textContent = 'Cooneen Group – Internal vacancies. The display could not start. Check the settings in the address.';
  if (window.console) window.console.error(err);
}
