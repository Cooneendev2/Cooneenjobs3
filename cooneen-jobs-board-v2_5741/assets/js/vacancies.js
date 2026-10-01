/* Vacancy selection and badge logic. Pure functions: no DOM, no network, easy to test.
   Dates are compared as Europe/London calendar days so "closes tomorrow" is right around midnight
   and across daylight-saving changes. */

export const TZ = 'Europe/London';
const DAY_MS = 24 * 60 * 60 * 1000;

let dayFmt = null;
try {
  dayFmt = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
} catch (e) { dayFmt = null; }

/* Whole London calendar days since the epoch. */
export function londonDay(ms) {
  if (!dayFmt) return Math.floor(ms / DAY_MS);
  let y = 0;
  let m = 0;
  let d = 0;
  dayFmt.formatToParts(new Date(ms)).forEach((p) => {
    if (p.type === 'year') y = Number(p.value);
    else if (p.type === 'month') m = Number(p.value);
    else if (p.type === 'day') d = Number(p.value);
  });
  return Date.UTC(y, m - 1, d) / DAY_MS;
}

export function isOpen(job, now) {
  return !isFinite(job.closingMs) || job.closingMs >= now;
}

/* "Fivemiletown, Co. Tyrone, Northern Ireland" -> "Fivemiletown" */
export function shortLocation(location, full) {
  if (!location) return '';
  if (full) return location;
  const first = location.split(',')[0].trim();
  return first || location;
}

function matchesAny(value, words) {
  if (!words.length) return true;
  const hay = String(value || '').toLowerCase();
  return words.some((w) => hay.indexOf(w) >= 0);
}

export function isFeatured(job, cfg) {
  if (!cfg.featured.length) return false;
  const id = job.id.toLowerCase();
  const ref = (job.reference || '').toLowerCase();
  return cfg.featured.some((token) => token === id || token === ref);
}

/* Work out everything the display needs to know about one vacancy. */
export function describe(job, cfg, now) {
  const closeDays = isFinite(job.closingMs) ? londonDay(job.closingMs) - londonDay(now) : NaN;
  const postedDays = isFinite(job.postedMs) ? londonDay(now) - londonDay(job.postedMs) : NaN;
  const featured = isFeatured(job, cfg);
  const isNew = cfg.showNew && isFinite(postedDays) && postedDays >= 0 && postedDays <= cfg.newDays;
  const closingSoon = cfg.showClosingSoon && cfg.closingDays > 0 &&
    isFinite(closeDays) && closeDays >= 0 && closeDays <= cfg.closingDays;
  const badges = [];
  if (closingSoon) badges.push('closing');
  if (featured && cfg.showFeatured) badges.push('featured');
  if (isNew) badges.push('new');
  return { job, id: job.id, featured, isNew, closingSoon, closeDays, postedDays, badges };
}

function rank(item) {
  if (item.featured) return 0;
  if (item.closingSoon) return 1;
  if (item.isNew) return 2;
  return 3;
}
const num = (v, fallback) => (isFinite(v) ? v : fallback);
const byTitle = (a, b) => a.job.title.localeCompare(b.job.title, 'en-GB', { sensitivity: 'base', numeric: true });
const byNewest = (a, b) => num(b.job.postedMs, 0) - num(a.job.postedMs, 0);
const byClosing = (a, b) => num(a.job.closingMs, Infinity) - num(b.job.closingMs, Infinity);

const SORTERS = {
  priority(a, b) {
    return (rank(a) - rank(b)) ||
      (rank(a) === 1 ? byClosing(a, b) : 0) ||
      byNewest(a, b) || byTitle(a, b);
  },
  newest(a, b) { return byNewest(a, b) || byTitle(a, b); },
  closing(a, b) { return byClosing(a, b) || byTitle(a, b); },
  title(a, b) { return byTitle(a, b); }
};

/* Open vacancies, filtered, ordered and limited according to the URL settings. */
export function selectVacancies(jobs, cfg, now) {
  const items = jobs
    .filter((job) => isOpen(job, now))
    .filter((job) => matchesAny(job.location, cfg.location) &&
      matchesAny(job.department, cfg.department) &&
      matchesAny(job.employmentType + ' ' + job.workPattern, cfg.type))
    .map((job) => describe(job, cfg, now));
  items.sort(SORTERS[cfg.sort] || SORTERS.priority);
  return cfg.limit > 0 ? items.slice(0, cfg.limit) : items;
}

/* Hero mode: the order its vacancies rotate in, one per screen. Returns { items, reason }.
   - ?job=<reference or id> pins one vacancy (the only way the hero stays on a single vacancy; if it is not open, the
     normal rotation is used);
   - hero=auto follows ?sort= (default: featured, closing soon, new, newest) - the same order as the other rotating modes;
   - hero=featured puts Featured vacancies first, hero=newest / hero=closing re-order the whole rotation. */
export function heroSequence(items, cfg) {
  if (!items.length) return { items: [], reason: 'none' };
  if (cfg.job) {
    const token = cfg.job.toLowerCase();
    const hit = items.find((it) => it.id.toLowerCase() === token || (it.job.reference || '').toLowerCase() === token);
    if (hit) return { items: [hit], reason: 'job' };
  }
  if (cfg.hero === 'newest') return { items: items.slice().sort(byNewest), reason: 'newest first' };
  if (cfg.hero === 'closing') return { items: items.slice().sort(byClosing), reason: 'closing first' };
  if (cfg.hero === 'featured') {
    const featured = items.filter((it) => it.featured);
    return { items: featured.concat(items.filter((it) => !it.featured)), reason: featured.length ? 'featured first' : 'all in order (no featured vacancy)' };
  }
  return { items: items.slice(), reason: 'all in order' };
}

/* Split the vacancies into screens of `size` (1 = one per screen, 2 = pairs for duo mode): 1+2, 3+4, 5+6, ...
   With an odd number the last screen is filled with the first vacancy again, so a screen is never half empty
   (a lone vacancy, or size 1, is shown on its own). Every vacancy appears in every cycle. */
export function groupSlides(items, size) {
  const n = Math.max(1, size | 0);
  const out = [];
  if (n === 1 || items.length < 2) return items.map((it) => [it]);
  for (let i = 0; i < items.length; i += n) {
    const group = items.slice(i, i + n);
    for (let k = 0; group.length < n; k += 1) group.push(items[k % items.length]);
    out.push(group);
  }
  return out;
}

/* A short string that changes only when something visible changes. */
export function signature(items) {
  return items.map((it) => it.id + ':' + it.badges.join('') + ':' + (isFinite(it.closeDays) ? it.closeDays : '-') +
    ':' + (isFinite(it.postedDays) ? it.postedDays : '-')).join('|');
}
