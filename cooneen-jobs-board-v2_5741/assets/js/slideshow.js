/* The rotating "one screen after another" display that hero, duo and carousel modes share.

   A mode supplies three things and this module does the rest:
     name      'hero' | 'duo' | 'carousel'          (CSS class mode-<name>)
     size      vacancies per screen (1, or 2 for duo)
     sequence  (items, cfg) -> { items, reason }    which vacancies, in which order
     create    (group, ctx) -> parts                builds the DOM for one screen ({ root, ... })
     fit       (parts) -> void                      makes the text fit once it is in the document
   Every vacancy is shown in turn, forever, each for cfg.rotation seconds (default 40). The rotation only stops when
   there is nothing to rotate (one screen, or nothing to show). One timer, no matter how long the screen runs. */

import { el, clear } from './dom.js';
import { createHeader, createStatus, createControls, createStatePanel, buildPager } from './components.js';
import { createRotator } from './rotator.js';
import { groupSlides } from './vacancies.js';

export function mountSlideshow(ctx, spec) {
  const { app, cfg } = ctx;
  const root = el('div', 'mode mode-' + spec.name);
  app.appendChild(root);

  const header = cfg.header ? createHeader(ctx) : null;
  if (header) root.appendChild(header.el);

  const area = el('main', 'slide-area');
  const slideHost = el('div', 'slide-host');
  const stateHost = el('div', 'state-host');
  stateHost.hidden = true;
  area.appendChild(slideHost);
  area.appendChild(stateHost);
  root.appendChild(area);

  /* Carousel keeps its "3 / 8" counter and (when someone might be at the screen) paging buttons;
     hero and duo only show a slim progress bar so the vacancies get the room. */
  const full = !!spec.footer;
  const foot = el('footer', 'foot' + (full ? '' : ' foot-slim'));
  const pager = el('div', 'pager');
  const counter = el('p', 'counter');
  const status = createStatus(ctx, full ? undefined : { warnOnly: true });
  foot.appendChild(pager);
  if (full) foot.appendChild(counter);
  foot.appendChild(status.el);
  root.appendChild(foot);

  let view = null;
  let groups = [];
  let reason = '';
  let index = 0;
  let current = null;
  let paused = false;
  let controls = null;
  const timers = new Set();

  function later(fn, ms) {
    const id = window.setTimeout(() => { timers.delete(id); fn(); }, ms);
    timers.add(id);
  }
  const rotator = createRotator(() => go(1, false));

  if (full && cfg.controls) {
    controls = createControls(ctx, { prev: () => go(-1, true), next: () => go(1, true), toggle: () => togglePause() });
    foot.appendChild(controls.el);
  }

  const idsOf = (list) => list.map((g) => g.map((it) => it.id).join('+')).join('|');

  function showState(kind) {
    rotator.stop();
    groups = [];
    current = null;
    clear(slideHost);
    clear(stateHost);
    pager.hidden = true;
    counter.hidden = true;
    slideHost.hidden = true;
    stateHost.hidden = false;
    stateHost.appendChild(createStatePanel(kind, ctx));
  }

  function build(i, keepPager) {
    const group = groups[i];
    if (!group) return;               /* the data may have changed during the fade */
    clear(slideHost);
    if (!keepPager) buildPager(pager, groups.length, i, cfg.rotation);
    counter.hidden = groups.length <= 1;
    counter.textContent = ctx.i18n.t('slideOf', { n: i + 1, total: groups.length });
    current = spec.create(group, ctx);
    slideHost.appendChild(current.root);
    spec.fit(current);
  }

  function render(i, animate, keepPager) {
    if (!groups[i]) return;
    if (animate && !ctx.reducedMotion) {
      slideHost.classList.add('is-out');
      later(() => { build(i, false); slideHost.classList.remove('is-out'); }, 380);
    } else {
      slideHost.classList.remove('is-out');
      build(i, keepPager);
    }
  }

  function go(delta, manual) {
    if (groups.length < 2) return;
    index = (index + delta + groups.length) % groups.length;
    render(index, true, false);
    if (manual) {
      rotator.restart();
      ctx.announce(groups[index].map((it) => it.job.title).join('. '));
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

      const seq = spec.sequence(v.items, cfg);
      const next = groupSlides(seq.items, spec.size);
      reason = seq.reason;
      const unchanged = !!current && idsOf(next) === idsOf(groups);
      /* Stay on the same screen if its first vacancy is still there. */
      const currentId = groups[index] ? groups[index][0].id : null;
      groups = next;
      const found = currentId ? groups.findIndex((g) => g[0].id === currentId) : -1;
      index = found >= 0 ? found : 0;

      clear(stateHost);
      stateHost.hidden = true;
      slideHost.hidden = false;
      /* Same vacancies in the same order (only a badge or a date changed): redraw the screen but leave the
         countdown and the progress bar running, so a data refresh never makes a vacancy stay up longer. */
      render(index, false, unchanged);
      if (groups.length > 1) { if (!unchanged) rotator.start(cfg.rotationMs); } else rotator.stop();
    },
    resize() { if (view && view.status === 'ok') render(index, false, true); },
    refit() { if (current) spec.fit(current); },
    tick(now) { if (header) header.tick(now); },
    next() { go(1, true); },
    prev() { go(-1, true); },
    togglePause,
    hold(why, on) { if (on) rotator.hold(why); else rotator.release(why); },
    info() {
      return {
        mode: spec.name, slides: groups.length, index, vacanciesPerSlide: spec.size, order: reason,
        showing: groups[index] ? groups[index].map((it) => it.job.title) : [],
        secondsPerSlide: cfg.rotation
      };
    },
    destroy() {
      if (header) header.destroy();
      rotator.destroy();
      timers.forEach((id) => window.clearTimeout(id));
      timers.clear();
      root.remove();
    }
  };
}
