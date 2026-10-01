/**
 * functions/api/jobs.js
 * Cloudflare Pages Function  ->  GET /api/jobs
 *
 * Fetches the current vacancies for the Cooneen Group internal careers site
 * (Talos ATS), normalises them, caches them, and returns clean JSON to index.html.
 *
 * HOW THE SOURCE WORKS (verified from a real browser capture of the careers page):
 *   - The vacancies page is an Angular single-page app. The vacancy list is NOT in the
 *     HTML; the browser loads it with one JSON request:
 *         POST https://api-careers-sites.talos360.com/api/careerssite/vacancies/search
 *     with the JSON body below. No cookies, tokens or special headers are sent, and the
 *     response carries "Access-Control-Allow-Origin: *".
 *   - The response is { "careersSiteVacancies": [ ...every current vacancy... ] }.
 *     The request has no page/offset/cursor field and the response has no paging
 *     metadata, so one call returns the whole list. This function therefore makes a
 *     single upstream call per refresh (plus one retry on network error / 5xx) and
 *     never loops. If Talos ever adds paging fields, `diag=1` lists any unexpected
 *     top-level keys so the change is visible.
 *   - The `custom=323-_324-` part of the page URL is the Location / Department filter
 *     with nothing selected. The page sends `metadataFilters: []`, so it restricts
 *     nothing, and neither does this function.
 *
 * REFRESH BEHAVIOUR (request-driven, NOT a scheduled job):
 *   Europe/London time is divided into slots that start at 08:00 and 12:00. The first
 *   request after a slot starts triggers one refresh from Talos; every later request in
 *   that slot is served from cache. Before 08:00 the previous day's 12:00 slot is still
 *   current. Daylight-saving changes are handled by Intl with the Europe/London zone.
 *   If a refresh fails, the previous cached data keeps being served (X-Jobs-Cache: STALE).
 *
 * SAFETY:
 *   - The upstream URL, request body and allowed link host are fixed constants below.
 *     Nothing from the client's request can change where the function connects.
 *   - Vacancy text is converted to plain text (no HTML is passed through).
 *   - Each vacancy's `overview` is its opening paragraph(s), cut from the full description the search call already
 *     returns (up to the first list or section heading) - the same wording the vacancy page opens with.
 *   - Each vacancy's `url` is its details page, https://<careers host>/job/<jobPostId> (the page with the Apply
 *     button), not the application form. Links must be https and on the careers host, otherwise they are dropped.
 */

// ---------------------------------------------------------------------------
// Fixed configuration
// ---------------------------------------------------------------------------
const CAREERS_ORIGIN = 'https://cooneensgroup1.talosats-careers.com';
const ALLOWED_LINK_HOSTS = new Set(['cooneensgroup1.talosats-careers.com']);

const UPSTREAM_URL = 'https://api-careers-sites.talos360.com/api/careerssite/vacancies/search';

// The careers site's own public identifier. It appears in the page's embedded state and
// in the request the page itself makes; it is not a secret.
const CAREERS_SITE_ID = 'e678b62a-eaf0-4925-9d8c-b812de7fa3a1';
const CAREERS_SITE_TYPE = 'Internal';

const TIMEZONE = 'Europe/London';
const REFRESH_HOURS = [8, 12]; // London local hours, ascending

const UPSTREAM_TIMEOUT_MS = 10000;
const MAX_ATTEMPTS = 2; // first try + one retry (network error / timeout / 5xx only)
const RETRY_DELAY_MS = 800;
const CONFIRM_EMPTY_DELAY_MS = 1500;
const FAILURE_COOLDOWN_MS = 60 * 1000; // after a failed refresh, do not hit Talos again for 60s
const MAX_RESPONSE_CHARS = 5 * 1000 * 1000;
const MAX_RECORDS = 1000;

const EDGE_TTL_SECONDS = 7 * 24 * 60 * 60; // kept long on purpose so it can serve as the stale fallback
const CACHE_KEY_PATH = '/__cache/jobs-v2';
const ENTRY_VERSION = 2; // 2 = entries carry `overview`, and `url` is the vacancy-details page

// Where a vacancy's own details page lives on the careers site (the page that has the Apply button).
// The QR codes on the screens open this page. If a scan ever lands somewhere unexpected, this is the one line to change.
const VACANCY_PATH = '/job/';

const SUMMARY_MAX = 240;
const OVERVIEW_MAX = 900;
const DESCRIPTION_MAX = 3000;
const FIELD_MAX = 200;

// ---------------------------------------------------------------------------
// Per-isolate state (best-effort extra layer on top of the Cache API)
// ---------------------------------------------------------------------------
let memoryEntry = null;
let inflight = null;
let lastFailureAt = 0;
let lastFailure = null;
let lastEdgeWrite = null; // { ok: boolean, at: ISO string }

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------
class UpstreamError extends Error {
  constructor(code, publicMessage, httpStatus, detail) {
    super(code);
    this.code = code;
    this.publicMessage = publicMessage;
    this.httpStatus = httpStatus || 502;
    this.detail = detail || {};
  }
}

function toPublicError(err) {
  if (err instanceof UpstreamError) {
    return { code: err.code, message: err.publicMessage, status: err.httpStatus, detail: err.detail };
  }
  return {
    code: 'internal_error',
    message: 'The vacancy service hit an unexpected problem.',
    status: 500,
    detail: {}
  };
}

// ---------------------------------------------------------------------------
// Europe/London slot logic
// ---------------------------------------------------------------------------
const londonFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: TIMEZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit'
});

function pad2(n) {
  return String(n).padStart(2, '0');
}

function londonParts(date) {
  const p = {};
  for (const part of londonFormatter.formatToParts(date)) {
    if (part.type !== 'literal') p[part.type] = part.value;
  }
  return {
    year: Number(p.year),
    month: Number(p.month),
    day: Number(p.day),
    hour: Number(p.hour) % 24,
    minute: Number(p.minute)
  };
}

/** The most recent 08:00/12:00 London boundary at or before `date`, as "YYYY-MM-DDTHH". */
function currentSlot(date) {
  const t = londonParts(date);
  let slotHour = null;
  for (const h of REFRESH_HOURS) {
    if (t.hour >= h) slotHour = h;
  }
  let y = t.year;
  let m = t.month;
  let d = t.day;
  if (slotHour === null) {
    slotHour = REFRESH_HOURS[REFRESH_HOURS.length - 1];
    const prev = new Date(Date.UTC(y, m - 1, d) - 24 * 60 * 60 * 1000);
    y = prev.getUTCFullYear();
    m = prev.getUTCMonth() + 1;
    d = prev.getUTCDate();
  }
  return y + '-' + pad2(m) + '-' + pad2(d) + 'T' + pad2(slotHour);
}

/** Converts a London wall-clock time (hour:00) to the real instant, DST-aware. */
function londonLocalToDate(y, m, d, h) {
  const wanted = Date.UTC(y, m - 1, d, h, 0, 0);
  let guess = wanted;
  for (let i = 0; i < 3; i++) {
    const p = londonParts(new Date(guess));
    const got = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, 0);
    const diff = wanted - got;
    if (diff === 0) break;
    guess += diff;
  }
  return new Date(guess);
}

/** The next 08:00/12:00 London boundary strictly after the current slot started. */
function nextRefreshAfter(date) {
  const t = londonParts(date);
  let hour = REFRESH_HOURS.find((h) => h > t.hour);
  let y = t.year;
  let m = t.month;
  let d = t.day;
  if (hour === undefined) {
    hour = REFRESH_HOURS[0];
    const next = new Date(Date.UTC(y, m - 1, d) + 24 * 60 * 60 * 1000);
    y = next.getUTCFullYear();
    m = next.getUTCMonth() + 1;
    d = next.getUTCDate();
  }
  return londonLocalToDate(y, m, d, hour);
}

// ---------------------------------------------------------------------------
// Text sanitising (everything is reduced to plain text)
// ---------------------------------------------------------------------------
const NAMED_ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ensp: ' ', emsp: ' ', thinsp: ' ',
  ndash: '–', mdash: '—', lsquo: '‘', rsquo: '’', sbquo: '‚',
  ldquo: '“', rdquo: '”', bdquo: '„', hellip: '…', bull: '•',
  middot: '·', pound: '£', euro: '€', yen: '¥', cent: '¢',
  copy: '©', reg: '®', trade: '™', deg: '°', plusmn: '±',
  times: '×', divide: '÷', frac12: '½', frac14: '¼', frac34: '¾',
  eacute: 'é', egrave: 'è', agrave: 'à', aacute: 'á', iacute: 'í',
  oacute: 'ó', uacute: 'ú', ccedil: 'ç', ntilde: 'ñ', uuml: 'ü',
  ouml: 'ö', auml: 'ä', szlig: 'ß', shy: ''
};

function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z][a-z0-9]*);/gi, (whole, body) => {
    if (body.charAt(0) === '#') {
      const isHex = body.charAt(1).toLowerCase() === 'x';
      const code = isHex ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) {
        return '';
      }
      return String.fromCodePoint(code);
    }
    const value = NAMED_ENTITIES[body.toLowerCase()];
    return value !== undefined ? value : whole;
  });
}

function tidyWhitespace(s, keepNewlines) {
  // control characters, bidi overrides and zero-width characters are removed
  s = s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f‪-‮⁦-⁩‌-‏﻿]/g, '');
  s = s.replace(/[  -​  　]/g, ' ');
  if (keepNewlines) {
    return s
      .split(/\r?\n/)
      .map((line) => line.replace(/[ \t]+/g, ' ').trim())
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }
  return s.replace(/\s+/g, ' ').trim();
}

function htmlToText(html) {
  if (typeof html !== 'string' || html === '') return '';
  let s = html;
  s = s.replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, ' ');
  s = s.replace(/<!--[\s\S]*?-->/g, ' ');
  s = s.replace(/<\s*br\s*\/?>/gi, '\n');
  s = s.replace(/<\s*li\b[^>]*>/gi, '\n• ');
  s = s.replace(/<\/\s*(p|div|li|ul|ol|h[1-6]|tr|table|section|article)\s*>/gi, '\n');
  s = s.replace(/<[^>]*>/g, ' ');
  s = decodeEntities(s);
  return tidyWhitespace(s, true);
}

function truncate(s, max) {
  if (s.length <= max) return s;
  let cut = s.slice(0, max);
  const lastCode = cut.charCodeAt(cut.length - 1);
  if (lastCode >= 0xd800 && lastCode <= 0xdbff) cut = cut.slice(0, -1);
  const space = cut.lastIndexOf(' ');
  if (space > max * 0.6) cut = cut.slice(0, space);
  return cut.replace(/[\s,.;:–—-]+$/, '') + '…';
}

/** Short single-line field (title, location, etc.). Returns '' for anything unusable. */
function cleanText(value) {
  if (Array.isArray(value)) {
    return truncate(value.map(cleanText).filter(Boolean).join(', '), FIELD_MAX);
  }
  if (typeof value === 'number' && Number.isFinite(value)) value = String(value);
  if (typeof value !== 'string') return '';
  const text = tidyWhitespace(htmlToText(value).replace(/\n+/g, ' '), false);
  return truncate(text, FIELD_MAX);
}

function makeSummary(description) {
  if (!description) return '';
  const firstBullet = description.indexOf('•');
  const lead = firstBullet > 60 ? description.slice(0, firstBullet) : description;
  return truncate(lead.replace(/\s+/g, ' ').trim(), SUMMARY_MAX);
}

// A heading such as "About the role" that introduces the overview itself (so it is skipped, not treated as the end of it).
const OVERVIEW_HEADING_RE =
  /^(about( us| the (role|job|position|opportunity|team))?|(the )?(role|job|position|opportunity)( (overview|summary|description|purpose))?|(job|role|position) (overview|summary|description|purpose)|purpose of (the )?(role|job|position)|overview|summary|introduction|description)\s*:?$/i;

/**
 * The vacancy's opening overview: the first complete paragraph(s) of the full description, up to (not including)
 * the first list or section heading ("Responsibilities", "Requirements", ...). It is taken from the full
 * `jobDescription` HTML that the search call already returns - the same text the vacancy page shows - so no
 * second request per vacancy is needed. Paragraphs are separated by a blank line. Returns '' if there is no
 * usable opening paragraph (the screens then fall back to the summary).
 */
function makeOverview(html) {
  if (typeof html !== 'string' || html === '') return '';
  const cleaned = html.replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
  // Split into blocks at block-level tags, keeping each tag so we know what started the block
  const parts = cleaned.split(/(<\s*\/?\s*(?:p|div|h[1-6]|ul|ol|li|table|tr|section|article|hr)\b[^>]*>|<\s*br\s*\/?>)/i);
  const paragraphs = [];
  let inHeading = false;
  let total = 0;
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (i % 2 === 1) {
      // a tag
      if (/^<\s*(ul|ol|li|table|tr|hr)\b/i.test(part)) break; // a list / table / rule starts: the overview is over
      if (/^<\s*h[1-6]\b/i.test(part)) inHeading = true;
      else if (/^<\s*\/\s*h[1-6]\b/i.test(part)) inHeading = false;
      continue;
    }
    if (part.indexOf('<') === -1 && part.trim() === '') continue;
    const text = htmlToText(part).replace(/\s+/g, ' ').trim();
    if (!text) continue;
    // a block that is entirely bold text (or sits inside <h1>-<h6>) is a section heading
    const withoutBold = htmlToText(part.replace(/<(strong|b)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')).trim();
    const isHeading = inHeading || (withoutBold === '' && text.length <= 90) || (/:$/.test(text) && text.length <= 60);
    if (isHeading) {
      if (paragraphs.length === 0 && OVERVIEW_HEADING_RE.test(text)) continue; // leading "About the role" label
      break;
    }
    if (text.length < 25 && paragraphs.length > 0) break; // a stray label line, not prose
    paragraphs.push(text);
    total += text.length;
    if (total >= OVERVIEW_MAX) break;
  }
  if (paragraphs.length === 0) return '';

  let out = paragraphs.join('\n\n');
  if (out.length > OVERVIEW_MAX) {
    // Prefer to end on a whole sentence; otherwise cut at a word.
    const window = out.slice(0, OVERVIEW_MAX);
    const m = window.match(/^[\s\S]*[.!?](?=\s|$)/);
    out = m && m[0].length >= OVERVIEW_MAX * 0.55 ? m[0] : truncate(window, OVERVIEW_MAX);
  }
  return out;
}

function toIsoDate(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const year = d.getUTCFullYear();
  if (year < 2000 || year > 2100) return '';
  return d.toISOString();
}

// ---------------------------------------------------------------------------
// Normalising vacancies
// ---------------------------------------------------------------------------
function metaValue(record, names) {
  if (!Array.isArray(record.metadata)) return '';
  for (const item of record.metadata) {
    if (!item || typeof item.name !== 'string') continue;
    if (names.indexOf(item.name.trim().toLowerCase()) === -1) continue;
    const v = cleanText(item.value);
    if (v) return v;
  }
  return '';
}

/**
 * The vacancy's own details page (https://<careers host>/job/<jobPostId>) - full role details with the Apply
 * button on it. This is deliberately NOT the application form route (`applyUrlRoute`), so a scan lets people read
 * about the role first. Returns an absolute, validated https URL on the careers host, or '' (never throws).
 */
function buildVacancyUrl(record) {
  const rawId = record.jobPostId !== undefined && record.jobPostId !== null ? String(record.jobPostId).trim() : '';
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(rawId)) return '';
  let base = typeof record.applyUrlBase === 'string' ? record.applyUrlBase.trim() : '';
  if (!base) base = CAREERS_ORIGIN;
  if (!base.endsWith('/')) base += '/';
  try {
    const u = new URL(VACANCY_PATH.replace(/^\//, '') + encodeURIComponent(rawId), base);
    if (u.protocol !== 'https:') return '';
    if (u.username || u.password) return '';
    if (!ALLOWED_LINK_HOSTS.has(u.hostname.toLowerCase())) return '';
    return u.origin + u.pathname;
  } catch (e) {
    return '';
  }
}

function normaliseRecord(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return null;

  const title = cleanText(record.jobTitle);
  const rawId = record.jobPostId !== undefined && record.jobPostId !== null ? String(record.jobPostId).trim() : '';
  const reference = cleanText(record.jobReference);
  const id = rawId || reference;
  if (!title || !id) return null;

  const location =
    metaValue(record, ['location']) ||
    cleanText(record.address) ||
    [cleanText(record.city), cleanText(record.county)].filter(Boolean).join(', ');

  const description = truncate(htmlToText(record.jobDescription), DESCRIPTION_MAX);

  return {
    id: id,
    reference: reference,
    title: title,
    location: location,
    department: metaValue(record, ['skill or department', 'department']),
    employmentType: cleanText(record.employmentType),
    workPattern: cleanText(record.employment),
    remote: record.remoteWork === true,
    postedDate: toIsoDate(record.dateCreated),
    closingDate: toIsoDate(record.expiryDate),
    summary: makeSummary(description),
    overview: makeOverview(record.jobDescription),
    description: description,
    url: buildVacancyUrl(record)
  };
}

function normaliseAll(rawList) {
  const stats = {
    recordsReceived: rawList.length,
    recordsBeyondLimit: Math.max(0, rawList.length - MAX_RECORDS),
    recordsMalformed: 0,
    duplicatesRemoved: 0,
    jobsPublished: 0,
    withLocation: 0,
    withDepartment: 0,
    withEmploymentType: 0,
    withPostedDate: 0,
    withClosingDate: 0,
    withOverview: 0,
    withLink: 0,
    linksRejected: 0,
    linkHosts: {}
  };
  const seen = new Set();
  const jobs = [];

  for (const record of rawList.slice(0, MAX_RECORDS)) {
    let job = null;
    try {
      job = normaliseRecord(record);
    } catch (e) {
      job = null;
    }
    if (!job) {
      stats.recordsMalformed += 1;
      continue;
    }
    const key = job.id;
    if (seen.has(key)) {
      stats.duplicatesRemoved += 1;
      continue;
    }
    seen.add(key);

    if (job.location) stats.withLocation += 1;
    if (job.department) stats.withDepartment += 1;
    if (job.employmentType) stats.withEmploymentType += 1;
    if (job.postedDate) stats.withPostedDate += 1;
    if (job.closingDate) stats.withClosingDate += 1;
    if (job.url) {
      stats.withLink += 1;
      const host = new URL(job.url).hostname;
      stats.linkHosts[host] = (stats.linkHosts[host] || 0) + 1;
    } else {
      stats.linksRejected += 1;
    }
    if (job.overview) stats.withOverview += 1;
    jobs.push(job);
  }

  jobs.sort((a, b) => {
    if (a.postedDate !== b.postedDate) return a.postedDate < b.postedDate ? 1 : -1;
    return a.title.localeCompare(b.title, 'en-GB');
  });
  stats.jobsPublished = jobs.length;
  return { jobs: jobs, stats: stats };
}

// ---------------------------------------------------------------------------
// Upstream fetch + validation
// ---------------------------------------------------------------------------
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchUpstreamOnce() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  let response;
  try {
    response = await fetch(UPSTREAM_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': 'Cooneen-Internal-Jobs-Board/1.0'
      },
      body: JSON.stringify({
        careersSiteObfuscatedId: CAREERS_SITE_ID,
        whereCriteria: null,
        metadataFilters: [],
        preFilters: [],
        siteType: CAREERS_SITE_TYPE
      }),
      redirect: 'manual',
      signal: controller.signal
    });

    const status = response.status;
    if (status >= 300 && status < 400) {
      throw new UpstreamError('upstream_redirect', 'The vacancy source redirected unexpectedly.', 502, { upstreamStatus: status });
    }
    if (status < 200 || status >= 300) {
      throw new UpstreamError('upstream_status', 'The vacancy source returned an error.', 502, { upstreamStatus: status });
    }

    const contentType = (response.headers.get('content-type') || '').toLowerCase();
    if (contentType.indexOf('json') === -1) {
      throw new UpstreamError('upstream_not_json', 'The vacancy source did not return JSON.', 502, { upstreamStatus: status, upstreamContentType: contentType.slice(0, 60) });
    }
    const declared = Number(response.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > MAX_RESPONSE_CHARS) {
      throw new UpstreamError('upstream_too_large', 'The vacancy source response was too large.', 502, { upstreamStatus: status });
    }

    const text = await response.text();
    if (text.length > MAX_RESPONSE_CHARS) {
      throw new UpstreamError('upstream_too_large', 'The vacancy source response was too large.', 502, { upstreamStatus: status });
    }

    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      throw new UpstreamError('upstream_not_json', 'The vacancy source returned unreadable data.', 502, { upstreamStatus: status });
    }
    if (!data || typeof data !== 'object' || Array.isArray(data) || !Array.isArray(data.careersSiteVacancies)) {
      throw new UpstreamError('upstream_schema', 'The vacancy source changed its data format.', 502, { upstreamStatus: status });
    }

    return {
      list: data.careersSiteVacancies,
      topLevelKeys: Object.keys(data).slice(0, 20),
      upstreamStatus: status,
      upstreamContentType: contentType.split(';')[0].trim(),
      upstreamChars: text.length
    };
  } catch (err) {
    if (err instanceof UpstreamError) throw err;
    if (err && err.name === 'AbortError') {
      throw new UpstreamError('upstream_timeout', 'The vacancy source took too long to respond.', 504);
    }
    throw new UpstreamError('upstream_unreachable', 'The vacancy source could not be reached.', 502);
  } finally {
    clearTimeout(timer);
  }
}

async function fetchUpstreamWithRetry() {
  let attempts = 0;
  let lastError = null;
  while (attempts < MAX_ATTEMPTS) {
    attempts += 1;
    try {
      const result = await fetchUpstreamOnce();
      result.attempts = attempts;
      return result;
    } catch (err) {
      lastError = err;
      const status = err instanceof UpstreamError ? err.detail.upstreamStatus : undefined;
      const retryable =
        err instanceof UpstreamError &&
        (err.code === 'upstream_timeout' ||
          err.code === 'upstream_unreachable' ||
          (err.code === 'upstream_status' && status >= 500));
      if (!retryable || attempts >= MAX_ATTEMPTS) break;
      await sleep(RETRY_DELAY_MS);
    }
  }
  if (lastError instanceof UpstreamError) lastError.detail.attempts = attempts;
  throw lastError;
}

async function fetchAndNormalise() {
  const upstream = await fetchUpstreamWithRetry();
  const normalised = normaliseAll(upstream.list);

  // A non-empty list in which every record is unusable means the format changed.
  // Treat that as a failure so cached data keeps being served instead of an empty board.
  if (upstream.list.length > 0 && normalised.jobs.length === 0) {
    throw new UpstreamError('upstream_schema', 'The vacancy source changed its data format.', 502, {
      upstreamStatus: upstream.upstreamStatus,
      attempts: upstream.attempts
    });
  }

  normalised.stats.upstreamStatus = upstream.upstreamStatus;
  normalised.stats.upstreamContentType = upstream.upstreamContentType;
  normalised.stats.upstreamChars = upstream.upstreamChars;
  normalised.stats.attempts = upstream.attempts;
  normalised.stats.topLevelKeys = upstream.topLevelKeys;
  return normalised;
}

async function buildFreshEntry(previousEntry, slot) {
  const started = Date.now();
  let result = await fetchAndNormalise();

  // Guard against a one-off empty answer wiping a populated board: confirm once.
  if (result.jobs.length === 0 && previousEntry && previousEntry.jobs.length > 0) {
    await sleep(CONFIRM_EMPTY_DELAY_MS);
    result = await fetchAndNormalise();
    result.stats.emptyResultConfirmed = true;
  }

  result.stats.durationMs = Date.now() - started;
  return {
    v: ENTRY_VERSION,
    slot: slot,
    fetchedAt: new Date().toISOString(),
    jobs: result.jobs,
    stats: result.stats
  };
}

// ---------------------------------------------------------------------------
// Cache helpers
// ---------------------------------------------------------------------------
function getEdgeCache() {
  try {
    if (typeof caches !== 'undefined' && caches && caches.default) return caches.default;
  } catch (e) {
    /* fall through */
  }
  return null;
}

function isValidEntry(entry) {
  return (
    entry &&
    typeof entry === 'object' &&
    entry.v === ENTRY_VERSION &&
    typeof entry.slot === 'string' &&
    typeof entry.fetchedAt === 'string' &&
    !Number.isNaN(Date.parse(entry.fetchedAt)) &&
    Array.isArray(entry.jobs) &&
    entry.stats &&
    typeof entry.stats === 'object'
  );
}

async function readEdgeCache(cache, keyRequest) {
  try {
    const hit = await cache.match(keyRequest);
    if (!hit) return null;
    const entry = await hit.json();
    return isValidEntry(entry) ? entry : null;
  } catch (e) {
    return null;
  }
}

async function writeEdgeCache(cache, keyRequest, entry) {
  if (!cache) return false;
  try {
    await cache.put(
      keyRequest,
      new Response(JSON.stringify(entry), {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=' + EDGE_TTL_SECONDS
        }
      })
    );
    lastEdgeWrite = { ok: true, at: new Date().toISOString() };
    return true;
  } catch (e) {
    lastEdgeWrite = { ok: false, at: new Date().toISOString() };
    return false;
  }
}

// ---------------------------------------------------------------------------
// Responses
// ---------------------------------------------------------------------------
function baseHeaders(cacheState, status) {
  return {
    'Content-Type': 'application/json; charset=utf-8',
    'X-Jobs-Cache': cacheState,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Cache-Control': status === 200 ? 'public, max-age=60' : 'no-store'
  };
}

function send(body, status, cacheState, headOnly) {
  return new Response(headOnly ? null : JSON.stringify(body), {
    status: status,
    headers: baseHeaders(cacheState, status)
  });
}

function buildDiagnostics(ctx, entry, extra) {
  const ageMinutes = entry ? Math.round((ctx.now.getTime() - Date.parse(entry.fetchedAt)) / 60000) : null;
  return Object.assign(
    {
      generatedAt: ctx.now.toISOString(),
      timezone: TIMEZONE,
      refreshHoursLondon: REFRESH_HOURS,
      currentSlot: ctx.slot,
      nextRefreshAt: nextRefreshAfter(ctx.now).toISOString(),
      cache: {
        edgeCacheAvailable: !!ctx.cache,
        edgeCacheNote: ctx.cacheNote || null,
        servedFrom: ctx.servedFrom,
        entrySlot: entry ? entry.slot : null,
        entryFetchedAt: entry ? entry.fetchedAt : null,
        entryAgeMinutes: ageMinutes,
        lastEdgeWrite: lastEdgeWrite
      },
      lastSuccessfulRefresh: entry ? entry.stats : null,
      failureCooldownSeconds: FAILURE_COOLDOWN_MS / 1000
    },
    extra || {}
  );
}

function respondWithEntry(ctx, entry, state, refreshError) {
  const stale = state === 'STALE';
  const payload = {
    jobs: entry.jobs,
    meta: {
      count: entry.jobs.length,
      fetchedAt: entry.fetchedAt,
      slot: entry.slot,
      nextRefreshAt: nextRefreshAfter(ctx.now).toISOString(),
      stale: stale
    }
  };
  if (stale && refreshError) payload.meta.staleReason = refreshError.code;
  if (ctx.diag) {
    payload.diagnostics = buildDiagnostics(ctx, entry, refreshError ? { refreshError: { code: refreshError.code, upstream: refreshError.detail } } : {});
  }
  return send(payload, 200, state, ctx.headOnly);
}

function respondWithError(ctx, error) {
  const body = { error: { code: error.code, message: error.message + ' No saved copy of the vacancies is available yet; please try again shortly.' } };
  if (ctx.diag) body.diagnostics = buildDiagnostics(ctx, null, { refreshError: { code: error.code, upstream: error.detail } });
  return send(body, error.status === 504 ? 504 : 502, 'ERROR', ctx.headOnly);
}

// ---------------------------------------------------------------------------
// Request handling
// ---------------------------------------------------------------------------
async function refreshAndStore(ctx, previousEntry) {
  const fresh = await buildFreshEntry(previousEntry, ctx.slot);
  memoryEntry = fresh;
  lastFailureAt = 0;
  lastFailure = null;
  await writeEdgeCache(ctx.cache, ctx.keyRequest, fresh);
  return fresh;
}

async function handleRequest(context, headOnly) {
  const request = context.request;
  const url = new URL(request.url);
  const now = new Date();

  // Cloudflare's Cache API does nothing on *.workers.dev hostnames, so do not pretend to use it there.
  const onWorkersDev = url.hostname.toLowerCase().endsWith('.workers.dev');

  const ctx = {
    now: now,
    slot: currentSlot(now),
    diag: url.searchParams.get('diag') === '1',
    headOnly: headOnly,
    cache: onWorkersDev ? null : getEdgeCache(),
    cacheNote: onWorkersDev
      ? 'workers.dev hostnames do not support the Cache API, so only per-server memory is used. Add a custom domain to share the cache.'
      : '',
    keyRequest: new Request(url.origin + CACHE_KEY_PATH, { method: 'GET' }),
    servedFrom: 'none'
  };

  // 1. Best copy we already have: this isolate's memory, or the data-centre cache.
  let entry = memoryEntry;
  ctx.servedFrom = entry ? 'memory' : 'none';
  if (!entry || entry.slot !== ctx.slot) {
    const stored = ctx.cache ? await readEdgeCache(ctx.cache, ctx.keyRequest) : null;
    if (stored && (!entry || Date.parse(stored.fetchedAt) > Date.parse(entry.fetchedAt))) {
      entry = stored;
      memoryEntry = stored;
      ctx.servedFrom = 'edge-cache';
    }
  }

  // 2. Current slot already fetched -> no Talos request at all.
  if (entry && entry.slot === ctx.slot) {
    return respondWithEntry(ctx, entry, 'HIT', null);
  }

  // 3. New slot: refresh once (concurrent requests in this isolate share one fetch).
  let refreshError = null;
  const coolingDown = lastFailure && now.getTime() - lastFailureAt < FAILURE_COOLDOWN_MS;
  if (coolingDown) {
    refreshError = lastFailure;
  } else {
    try {
      if (!inflight) {
        inflight = refreshAndStore(ctx, entry).finally(() => {
          inflight = null;
        });
      }
      const fresh = await inflight;
      ctx.servedFrom = 'upstream';
      return respondWithEntry(ctx, fresh, 'MISS', null);
    } catch (err) {
      refreshError = toPublicError(err);
      lastFailureAt = Date.now();
      lastFailure = refreshError;
    }
  }

  // 4. Refresh failed: keep serving the last good data if there is any.
  if (entry) return respondWithEntry(ctx, entry, 'STALE', refreshError);
  return respondWithError(ctx, refreshError);
}

export async function onRequestGet(context) {
  return handleRequest(context, false);
}

export async function onRequest(context) {
  const method = context.request.method;
  if (method === 'GET') return handleRequest(context, false);
  if (method === 'HEAD') return handleRequest(context, true);
  const headers = baseHeaders('ERROR', 405);
  headers.Allow = 'GET, HEAD';
  return new Response(JSON.stringify({ error: { code: 'method_not_allowed', message: 'Use GET.' } }), {
    status: 405,
    headers: headers
  });
}
