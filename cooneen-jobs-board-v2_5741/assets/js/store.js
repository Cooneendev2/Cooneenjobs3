/* Vacancy data layer.
   Owns everything about getting vacancies: fetching /api/jobs, validating the payload, keeping a
   saved copy, retrying with back-off, and polling. It knows nothing about how vacancies are shown.
   Display code subscribes to it and reads store.state / store.health().

   The /api/jobs Pages Function (unchanged from the first version) does the real work against Talos
   and keeps the 08:00 / 12:00 London cache; this module just asks it politely and survives it failing. */

const API_PATH = '/api/jobs';
const STORAGE_KEY = 'cooneen-vacancies-v3';   /* v3: vacancies carry an overview and link to the vacancy page */
const FETCH_TIMEOUT_MS = 20000;
const OLD_AFTER_MS = 26 * 60 * 60 * 1000;   /* longest normal gap between server refreshes is about 20 hours */
const BACKOFF_START_MS = 30 * 1000;
const OFFLINE_WARN_MS = 15 * 60 * 1000;     /* don't alarm anyone over one or two failed checks */

export const CAREERS_HOST = 'cooneensgroup1.talosats-careers.com';
export const CAREERS_URL = 'https://' + CAREERS_HOST + '/all-vacancies';

function str(value, max) {
  if (typeof value !== 'string') return '';
  return value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f‪-‮⁦-⁩]/g, '').trim().slice(0, max || 400);
}
function dateMs(value) {
  const t = typeof value === 'string' ? Date.parse(value) : NaN;
  return isFinite(t) ? t : NaN;
}
/* Only https links on the careers host are ever used (as links or inside QR codes). */
export function safeUrl(value) {
  if (typeof value !== 'string' || !value) return '';
  try {
    const u = new URL(value);
    if (u.protocol !== 'https:' || u.hostname.toLowerCase() !== CAREERS_HOST || u.username || u.password) return '';
    return u.href;
  } catch (e) { return ''; }
}

function sanitiseJob(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const title = str(raw.title, 200);
  const id = str(raw.id === undefined || raw.id === null ? '' : String(raw.id), 100);
  if (!title || !id) return null;
  return {
    id,
    title,
    reference: str(raw.reference, 100),
    location: str(raw.location, 200),
    department: str(raw.department, 200),
    employmentType: str(raw.employmentType, 100),
    workPattern: str(raw.workPattern, 100),
    remote: raw.remote === true,
    postedMs: dateMs(raw.postedDate),
    closingMs: dateMs(raw.closingDate),
    summary: str(raw.summary, 400),
    overview: str(raw.overview, 1000),
    url: safeUrl(raw.url)
  };
}

export function parsePayload(payload) {
  if (!payload || typeof payload !== 'object' || !Array.isArray(payload.jobs)) throw new Error('bad payload');
  const seen = {};
  const jobs = [];
  payload.jobs.forEach((raw) => {
    const job = sanitiseJob(raw);
    if (!job || seen[job.id]) return;
    seen[job.id] = true;
    jobs.push(job);
  });
  if (payload.jobs.length > 0 && jobs.length === 0) throw new Error('no usable vacancies');
  const meta = payload.meta && typeof payload.meta === 'object' ? payload.meta : {};
  return {
    jobs,
    fetchedMs: dateMs(meta.fetchedAt),
    nextMs: dateMs(meta.nextRefreshAt),
    serverStale: meta.stale === true,
    diagnostics: payload.diagnostics && typeof payload.diagnostics === 'object' ? payload.diagnostics : null
  };
}

const rand = (min, max) => min + Math.random() * (max - min);

export function createStore(options) {
  const opts = options || {};
  const now = opts.now || (() => Date.now());
  const fetchFn = opts.fetchFn || ((...args) => window.fetch(...args));
  const refreshMs = opts.refreshMs || 10 * 60 * 1000;
  const listeners = new Set();

  const state = {
    phase: 'loading',        /* loading | ready | failed */
    jobs: [],
    fetchedMs: NaN,          /* when the server last pulled from Talos */
    serverStale: false,
    source: 'none',          /* none | server | saved */
    lastOkMs: 0,
    lastTryMs: 0,
    failures: 0,
    attempts: 0,
    nextTryMs: 0,
    serverNextMs: NaN,
    diagnostics: null,
    lastError: '',
    inflight: false
  };
  let timer = 0;
  let running = false;

  function emit() {
    listeners.forEach((fn) => {
      try { fn(state); } catch (err) { if (window.console) window.console.error('store listener failed', err); }
    });
  }

  function loadCopy() {
    try {
      const text = window.localStorage.getItem(STORAGE_KEY);
      return text ? parsePayload(JSON.parse(text)) : null;
    } catch (e) { return null; }
  }
  function saveCopy(payload) {
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ jobs: payload.jobs, meta: payload.meta })); } catch (e) { /* storage may be off */ }
  }

  function apply(parsed, source) {
    state.jobs = parsed.jobs;
    state.fetchedMs = parsed.fetchedMs;
    state.serverStale = parsed.serverStale;
    state.serverNextMs = parsed.nextMs;
    state.diagnostics = parsed.diagnostics || state.diagnostics;
    state.source = source;
    state.phase = 'ready';
  }

  function schedule(success) {
    window.clearTimeout(timer);
    timer = 0;
    if (!running) return;
    let delay;
    if (success) {
      delay = refreshMs * rand(0.9, 1.1);
      /* Check again soon after the server's next 08:00 / 12:00 refresh, spread out so screens don't all arrive at once. */
      if (isFinite(state.serverNextMs)) {
        const untilSlot = state.serverNextMs - now() + rand(20000, 120000);
        if (untilSlot > 0 && untilSlot < delay) delay = Math.max(30000, untilSlot);
      }
    } else {
      delay = Math.min(refreshMs, BACKOFF_START_MS * Math.pow(2, Math.max(0, state.failures - 1))) * rand(0.9, 1.1);
    }
    state.nextTryMs = now() + delay;
    timer = window.setTimeout(() => { refresh(false); }, delay);
  }

  async function refresh(manual) {
    if (state.inflight) return;
    state.inflight = true;
    state.lastTryMs = now();
    state.attempts += 1;
    emit();
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const abortTimer = controller ? window.setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS) : 0;
    let success = false;
    try {
      const response = await fetchFn(API_PATH + (opts.diag ? '?diag=1' : ''), {
        headers: { Accept: 'application/json' },
        cache: manual ? 'reload' : 'no-store',
        signal: controller ? controller.signal : undefined
      });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const payload = await response.json();
      const parsed = parsePayload(payload);
      apply(parsed, 'server');
      state.failures = 0;
      state.lastOkMs = now();
      state.lastError = '';
      saveCopy(payload);
      success = true;
    } catch (err) {
      state.failures += 1;
      state.lastError = String(err && err.message ? err.message : err);
      if (state.phase !== 'ready') {
        const copy = loadCopy();
        if (copy) apply(copy, 'saved');
        else state.phase = 'failed';
      }
    } finally {
      window.clearTimeout(abortTimer);
      state.inflight = false;
      schedule(success);
      emit();
    }
  }

  return {
    state,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    start() { running = true; refresh(false); },
    stop() { running = false; window.clearTimeout(timer); timer = 0; },
    refresh,
    /* Called when the screen wakes up or the network comes back: catch up if a check is overdue, or if the
       last one failed (so a screen recovers within seconds of the network returning, not after the back-off). */
    wake() {
      if (!running || state.inflight) return;
      if (!(state.failures > 0 || now() >= state.nextTryMs - 1000)) return;
      const wait = 5000 - (now() - state.lastTryMs);          /* never hammer: at most one check per 5 seconds */
      if (wait > 0) {
        window.clearTimeout(timer);
        state.nextTryMs = now() + wait;
        timer = window.setTimeout(() => { refresh(false); }, wait);
        return;
      }
      refresh(false);
    },
    /* fresh | stale | offline | saved | old | none  */
    health(t) {
      const when = t === undefined ? now() : t;
      if (state.phase !== 'ready') return 'none';
      if (state.source === 'saved') return 'saved';
      if (state.failures > 0 && when - state.lastOkMs > Math.max(OFFLINE_WARN_MS, refreshMs * 1.5)) return 'offline';
      if (state.serverStale) return 'stale';
      if (isFinite(state.fetchedMs) && when - state.fetchedMs > OLD_AFTER_MS) return 'old';
      return 'fresh';
    },
    /* The time the data on screen is actually from. */
    dataTimeMs() { return isFinite(state.fetchedMs) ? state.fetchedMs : state.lastOkMs; }
  };
}
