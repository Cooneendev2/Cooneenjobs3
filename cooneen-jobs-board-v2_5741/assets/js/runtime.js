/* Long-running housekeeping for screens that stay on for weeks:
   - pauses animation and rotation while the tab/screen is hidden, catches up when it returns,
   - keeps the display awake (kiosk), re-checks data when the network comes back,
   - reloads the page once a night (only if the site is reachable) so memory is released and new
     versions of this app are picked up,
   - reloads itself if the page starts throwing repeated errors,
   - keyboard shortcuts (arrows, space, F) and the ?diag=1 panel. */

import { VERSION } from './config.js';

const HEARTBEAT_MS = 30 * 1000;
const ERROR_WINDOW_MS = 10 * 60 * 1000;
const ERROR_LIMIT = 5;
const ERROR_RELOAD_GAP_MS = 30 * 60 * 1000;

function londonMinutes(ms) {
  let h = 0;
  let m = 0;
  new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hour12: false })
    .formatToParts(new Date(ms)).forEach((p) => {
      if (p.type === 'hour') h = Number(p.value) % 24;
      else if (p.type === 'minute') m = Number(p.value);
    });
  return h * 60 + m;
}

/* The next time it is HH:MM in London, as a timestamp. Corrects for the clocks changing in between. */
export function nextLondonTime(fromMs, minutesOfDay) {
  let delta = minutesOfDay - londonMinutes(fromMs);
  if (delta <= 0) delta += 24 * 60;
  let t = fromMs + delta * 60000 - new Date(fromMs).getUTCSeconds() * 1000;
  for (let i = 0; i < 2; i += 1) {
    let diff = minutesOfDay - londonMinutes(t);
    if (diff > 720) diff -= 1440;
    if (diff < -720) diff += 1440;
    if (diff === 0) break;
    t += diff * 60000;
  }
  return t > fromMs ? t : t + 24 * 3600000;
}

export function createRuntime(o) {
  const cfg = o.cfg;
  const started = Date.now();
  const errors = [];
  let hidden = document.hidden;
  let wakeLock = null;
  let reloadAt = 0;
  let reloadChecks = 0;
  let heartbeatId = 0;

  function scheduleReload(from) {
    reloadAt = cfg.reload < 0 ? 0 : nextLondonTime(from, cfg.reload) + Math.floor(Math.random() * 15 * 60000);
  }

  /* Never reload into a browser error page: check the site answers first. */
  async function tryReload() {
    try {
      const res = await window.fetch(window.location.pathname, { method: 'HEAD', cache: 'no-store' });
      if (res.ok) { window.location.reload(); return; }
    } catch (e) { /* offline: try again later */ }
    reloadChecks += 1;
    reloadAt = Date.now() + 10 * 60000;
  }

  function onError() {
    const t = Date.now();
    errors.push(t);
    while (errors.length && t - errors[0] > ERROR_WINDOW_MS) errors.shift();
    if (errors.length >= ERROR_LIMIT) {
      let last = 0;
      try { last = Number(window.sessionStorage.getItem('cooneen-error-reload') || 0); } catch (e) { last = 0; }
      if (t - last > ERROR_RELOAD_GAP_MS) {
        try { window.sessionStorage.setItem('cooneen-error-reload', String(t)); } catch (e) { /* ignore */ }
        errors.length = 0;
        tryReload();
      }
    }
  }

  function requestWakeLock() {
    if (!cfg.kiosk || wakeLock || !navigator.wakeLock || !navigator.wakeLock.request) return;
    navigator.wakeLock.request('screen').then((lock) => {
      wakeLock = lock;
      lock.addEventListener('release', () => { wakeLock = null; });
    }).catch(() => { /* not allowed or not supported: nothing to do */ });
  }

  function onVisibility() {
    hidden = document.hidden;
    o.onHidden(hidden);
    if (!hidden) {
      requestWakeLock();
      o.store.wake();
      o.onHeartbeat();
    }
  }
  function onOnline() { o.store.wake(); }

  function onKey(event) {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    const target = event.target;
    const mode = o.getMode();
    if (!mode) return;
    const onControl = target && target.closest && target.closest('button, a, input, select, textarea');
    const key = event.key;
    if ((key === 'ArrowRight' || key === 'PageDown') && mode.next) { mode.next(); event.preventDefault(); }
    else if ((key === 'ArrowLeft' || key === 'PageUp') && mode.prev) { mode.prev(); event.preventDefault(); }
    else if ((key === ' ' || key === 'p' || key === 'P') && mode.togglePause && !onControl) { mode.togglePause(); event.preventDefault(); }
    else if ((key === 'f' || key === 'F') && document.documentElement.requestFullscreen && !onControl) {
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen().catch(() => {});
    }
  }

  function heartbeat() {
    /* A missed visibilitychange (some phone and signage browsers drop them) must not leave the rotation frozen. */
    if (hidden !== document.hidden) onVisibility();
    /* A failing redraw must not stop the nightly reload from being checked; it is re-thrown on its own so the
       error watchdog above counts it (5 in 10 minutes -> one reload). */
    try { o.onHeartbeat(); } catch (err) { window.setTimeout(() => { throw err; }, 0); }
    if (reloadAt && Date.now() >= reloadAt) tryReload();
  }

  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('online', onOnline);
  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onError);
  document.addEventListener('keydown', onKey);
  scheduleReload(started);
  requestWakeLock();
  heartbeatId = window.setInterval(heartbeat, HEARTBEAT_MS);

  return {
    isHidden() { return hidden; },
    info() {
      const mem = window.performance && window.performance.memory ? window.performance.memory : null;
      return {
        version: VERSION,
        uptimeMinutes: Math.round((Date.now() - started) / 60000),
        hidden,
        wakeLock: !!wakeLock,
        nextReload: reloadAt ? new Date(reloadAt).toISOString() : 'off',
        reloadChecksFailed: reloadChecks,
        recentErrors: errors.length,
        domNodes: document.getElementsByTagName('*').length,
        heapMB: mem ? Math.round(mem.usedJSHeapSize / 1048576) : 'n/a'
      };
    },
    destroy() {
      window.clearInterval(heartbeatId);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onError);
      document.removeEventListener('keydown', onKey);
      if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }
    }
  };
}

/* ?diag=1: a small panel for whoever is installing or troubleshooting a screen. */
export function createDiag(o) {
  const pre = document.createElement('pre');
  pre.className = 'diag';
  pre.setAttribute('aria-label', 'Diagnostics');
  o.host.appendChild(pre);

  function iso(ms) { return isFinite(ms) && ms > 0 ? new Date(ms).toISOString() : '-'; }

  function snapshot() {
    const st = o.store.state;
    const server = st.diagnostics || null;
    const cfg = o.cfg;
    return {
      app: VERSION,
      settings: {
        mode: cfg.mode, layout: cfg.layout, theme: cfg.theme, lang: cfg.lang, kiosk: cfg.kiosk,
        orientation: cfg.orientation, rotate: cfg.rotate, columns: cfg.columns, rows: cfg.rows,
        rotation: cfg.rotation, refreshMinutes: cfg.refresh, qr: cfg.qr, links: cfg.links,
        fontscale: cfg.fontscale, motion: o.reducedMotion ? 'reduced' : 'full',
        explicit: Object.keys(cfg.provided)
      },
      ignoredParameters: o.issues,
      screen: {
        window: window.innerWidth + 'x' + window.innerHeight, stage: o.stage.info.W + 'x' + o.stage.info.H,
        orientation: o.stage.info.orientation, designPixel: Math.round(o.stage.info.s * 1000) / 1000 + 'px', dpr: o.stage.info.dpr
      },
      data: {
        phase: st.phase, source: st.source, health: o.store.health(), vacanciesFromServer: st.jobs.length,
        shownOnScreen: o.getView() ? o.getView().items.length : 0,
        serverFetchedFromTalos: iso(st.fetchedMs), serverNextRefresh: iso(st.serverNextMs),
        lastCheck: iso(st.lastTryMs), lastSuccess: iso(st.lastOkMs), nextCheck: iso(st.nextTryMs),
        failures: st.failures, lastError: st.lastError || '-', checks: st.attempts
      },
      server: server ? {
        servedFrom: server.cache && server.cache.servedFrom,
        currentSlot: server.currentSlot,
        lastRefresh: server.lastSuccessfulRefresh && {
          recordsReceived: server.lastSuccessfulRefresh.recordsReceived,
          jobsPublished: server.lastSuccessfulRefresh.jobsPublished
        },
        refreshError: server.refreshError || null
      } : '(add ?diag=1 to see server details)',
      mode: o.getMode() && o.getMode().info ? o.getMode().info() : null,
      runtime: o.runtime().info(),
      fonts: document.fonts && document.fonts.check ? { nunito: document.fonts.check('800 20px Nunito') } : 'n/a',
      notes: o.notes
    };
  }
  function refresh() { pre.textContent = JSON.stringify(snapshot(), null, 1); }
  const id = window.setInterval(refresh, 2000);
  refresh();
  return { refresh, destroy() { window.clearInterval(id); pre.remove(); } };
}
