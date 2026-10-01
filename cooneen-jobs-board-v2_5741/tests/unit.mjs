/* Unit tests for the pure parts of the display: URL parameters, translations, badge logic, layout engine
   and data validation. No dependencies:   node --no-warnings tests/unit.mjs
   (Needs Node 20.19+ / 22.7+, which can load the browser modules directly.) */

import assert from 'node:assert/strict';
import { parseConfig, SCHEMA, MODES, THEMES, LANGS } from '../assets/js/config.js';
import { DICT, validateDictionary, createI18n } from '../assets/js/i18n.js';
import { londonDay, describe as describeJob, selectVacancies, heroSequence, groupSlides, shortLocation, isOpen } from '../assets/js/vacancies.js';
import { computeWallLayout, sliceIntoPages } from '../assets/js/layout.js';
import { parsePayload, safeUrl, CAREERS_HOST } from '../assets/js/store.js';
import { encodeQR, qrToPath } from '../assets/js/qr.js';
import { nextLondonTime } from '../assets/js/runtime.js';
import { updated as paramDocUpdated } from '../tools/params-doc.mjs';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

let passed = 0;
const failures = [];
function test(name, fn) {
  try { fn(); passed += 1; } catch (e) { failures.push(name + '\n    ' + String(e.message).split('\n').join('\n    ')); }
}
const cfgOf = (q) => parseConfig(q).cfg;
const iso = (s) => Date.parse(s);

/* ------------------------------------------------------------------ URL parameters */
test('defaults: wall', () => {
  const c = cfgOf('');
  assert.equal(c.mode, 'wall'); assert.equal(c.layout, 'wall'); assert.equal(c.theme, 'cooneen'); assert.equal(c.lang, 'en');
  assert.equal(c.header, true); assert.equal(c.clock, false); assert.equal(c.qr, false); assert.equal(c.links, false);
  assert.equal(c.rotation, 20); assert.equal(c.fontscale, 1); assert.equal(c.gap, 28); assert.equal(c.controls, true);
  assert.equal(c.refresh, 10); assert.equal(c.reload, 210);   // 03:30
});
test('defaults per mode', () => {
  /* every screen of the rotating modes stays up for 40 seconds; the wall pages every 20 */
  ['carousel', 'hero', 'duo'].forEach((m) => { assert.equal(cfgOf('?mode=' + m).rotation, 40, m); assert.equal(cfgOf('?mode=' + m).rotationMs, 40000, m); });
  assert.equal(cfgOf('?mode=wall').rotation, 20); assert.equal(cfgOf('?mode=kiosk').rotation, 20);
  assert.equal(cfgOf('?mode=hero&rotation=15').rotation, 15);
  ['carousel', 'hero', 'duo'].forEach((m) => assert.equal(cfgOf('?mode=' + m).showSummary, true, m));
  assert.equal(cfgOf('?mode=wall').showSummary, false);
  assert.equal(cfgOf('?mode=hero').qr, true); assert.equal(cfgOf('?mode=duo').qr, true);
  assert.equal(cfgOf('?mode=carousel').qr, false); assert.equal(cfgOf('?mode=wall').qr, false);
  /* the Cooneen heading band (logo + INTERNAL VACANCIES) is on in every signage mode, hero and duo included */
  ['wall', 'kiosk', 'carousel', 'hero', 'duo'].forEach((m) => assert.equal(cfgOf('?mode=' + m).header, true, m));
  assert.equal(cfgOf('?mode=hero&header=0').header, false);
  assert.equal(cfgOf('?mode=duo').layout, 'duo');
  assert.equal(cfgOf('?mode=hero').controls, false); assert.equal(cfgOf('?mode=duo').controls, false);
  assert.equal(cfgOf('?mode=ticker').header, false);
  assert.equal(cfgOf('').logoBg, 'dark'); assert.equal(cfgOf('?logobg=light').logoBg, 'light'); assert.equal(cfgOf('?logobg=pink').logoBg, 'dark');
  const w = cfgOf('?mode=widget');
  assert.equal(w.rows, 5); assert.equal(w.links, true); assert.equal(w.controls, false);
});
test('kiosk is wall + signage behaviour; kiosk=1 works on any mode', () => {
  const k = cfgOf('?mode=kiosk');
  assert.equal(k.layout, 'wall'); assert.equal(k.kiosk, true); assert.equal(k.clock, true); assert.equal(k.fontscale, 1.1);
  assert.equal(k.controls, false); assert.equal(k.links, false);
  const c = cfgOf('?mode=carousel&kiosk=1');
  assert.equal(c.layout, 'carousel'); assert.equal(c.kiosk, true); assert.equal(c.controls, false);
  assert.equal(cfgOf('?mode=widget&kiosk=1').links, false);
});
test('explicit values override mode defaults', () => {
  const c = cfgOf('?mode=hero&qr=0&header=1&fontscale=1.5&gap=50&rotation=30&clock=1');
  assert.equal(c.qr, false); assert.equal(c.header, true); assert.equal(c.fontscale, 1.5); assert.equal(c.gap, 50);
  assert.equal(c.rotation, 30); assert.equal(c.rotationMs, 30000); assert.equal(c.clock, true);
  assert.equal(cfgOf('?density=compact').gap, 16);
  assert.equal(cfgOf('?density=compact&gap=20').gap, 20);
});
test('names are case-insensitive, values are forgiving', () => {
  const c = cfgOf('?MODE=Carousel&ShowLocation=OFF&SHOWNEW=no&theme=HighContrast&qr=true&lang=DE');
  assert.equal(c.mode, 'carousel'); assert.equal(c.showLocation, false); assert.equal(c.showNew, false);
  assert.equal(c.theme, 'highcontrast'); assert.equal(c.qr, true); assert.equal(c.lang, 'de');
  assert.equal(cfgOf('?qr').qr, true);            // bare flag = on
});
test('invalid values fall back to defaults and are reported', () => {
  const r = parseConfig('?mode=disco&columns=abc&fontscale=-3&rotate=45&lang=xx&rotation=NaN&unknown=1&theme=');
  assert.equal(r.cfg.mode, 'wall'); assert.equal(r.cfg.columns, 0); assert.equal(r.cfg.rotate, 0); assert.equal(r.cfg.lang, 'en');
  assert.equal(r.cfg.fontscale, 0.5);              // numbers out of range are clamped (and reported), not rejected
  const keys = r.issues.map((i) => i.key);
  ['mode', 'columns', 'fontscale', 'rotate', 'lang', 'rotation', 'unknown', 'theme'].forEach((k) => assert.ok(keys.indexOf(k) >= 0, 'issue for ' + k));
});
test('numbers are clamped, not trusted', () => {
  assert.equal(cfgOf('?fontscale=99').fontscale, 3);
  assert.equal(cfgOf('?fontscale=0.1').fontscale, 0.5);
  assert.equal(cfgOf('?columns=500').columns, 10);
  assert.equal(cfgOf('?rotation=0').rotation, 3);
  assert.equal(cfgOf('?refresh=0').refresh, 2);
  assert.equal(cfgOf('?gap=9999').gap, 120);
});
test('rotate accepts 90/180/270 and equivalents', () => {
  assert.equal(cfgOf('?rotate=90').rotate, 90); assert.equal(cfgOf('?rotate=180').rotate, 180);
  assert.equal(cfgOf('?rotate=270').rotate, 270); assert.equal(cfgOf('?rotate=-90').rotate, 270);
  assert.equal(cfgOf('?rotate=450').rotate, 90); assert.equal(cfgOf('?rotate=0').rotate, 0);
});
test('lists, time and text', () => {
  assert.deepEqual(cfgOf('?featured=AB123, 9988 ,').featured, ['ab123', '9988']);
  assert.deepEqual(cfgOf('?location=fivemile,dungannon').location, ['fivemile', 'dungannon']);
  assert.equal(cfgOf('?reload=off').reload, -1); assert.equal(cfgOf('?reload=04:15').reload, 255);
  assert.equal(parseConfig('?reload=25:00').cfg.reload, 210);
  assert.equal(cfgOf('?title=' + encodeURIComponent('A\u0000B‮')).title, 'AB');
  assert.equal(cfgOf('?title=' + 'x'.repeat(500)).title.length, 80);
});
test('first duplicate parameter wins', () => { assert.equal(cfgOf('?theme=dark&theme=light').theme, 'dark'); });
test('every schema entry has a default of the right type and a description', () => {
  SCHEMA.forEach((s) => {
    assert.ok(s.key && s.type && s.group && s.desc, 'complete: ' + s.key);
    if (s.type === 'enum') assert.ok(s.values.indexOf(s.def) >= 0, 'enum default valid: ' + s.key);
  });
  assert.ok(MODES.length === 7 && MODES.indexOf('duo') >= 0 && THEMES.length >= 4 && LANGS.length === 6);
});
test('all parameters in the specification exist', () => {
  const want = ['mode', 'theme', 'lang', 'rotation', 'columns', 'fontscale', 'cardsize', 'density', 'kiosk', 'orientation',
    'rotate', 'qr', 'showClosingSoon', 'showFeatured', 'showPostedDate', 'showLocation', 'showDepartment', 'showType', 'gap', 'rows'];
  want.forEach((k) => assert.ok(SCHEMA.some((s) => s.key === k), 'param ' + k));
});

/* ------------------------------------------------------------------ translations */
test('every language has every key and the same placeholders', () => { assert.deepEqual(validateDictionary(), []); });
test('six languages', () => { assert.deepEqual(Object.keys(DICT).sort(), ['de', 'en', 'es', 'fr', 'nl', 'ro']); });
test('plurals: en / fr / ro', () => {
  const en = createI18n('en'); const fr = createI18n('fr'); const ro = createI18n('ro');
  assert.equal(en.t('count', { n: 1 }), '1 open vacancy'); assert.equal(en.t('count', { n: 5 }), '5 open vacancies');
  assert.equal(fr.t('count', { n: 0 }), '0 poste ouvert');            // French treats 0 as singular
  assert.equal(fr.t('count', { n: 2 }), '2 postes ouverts');
  assert.equal(ro.t('count', { n: 1 }), '1 post vacant'); assert.equal(ro.t('count', { n: 3 }), '3 posturi vacante');
  assert.equal(ro.t('count', { n: 20 }), '20 de posturi vacante');
});
test('unknown language and unknown key degrade safely', () => {
  assert.equal(createI18n('xx').lang, 'en');
  assert.equal(createI18n('en').t('doesNotExist'), 'doesNotExist');
  assert.equal(createI18n('en').t('closesInDays', {}), 'Closes in {n} days');   // missing variable is left visible, not crashing
});
test('dates and times are Europe/London, 24 hour', () => {
  const en = createI18n('en');
  assert.equal(en.time(iso('2026-07-01T12:30:00Z')), '13:30');           // BST
  assert.equal(en.time(iso('2026-12-01T12:30:00Z')), '12:30');           // GMT
  assert.equal(en.date(iso('2026-10-09T22:59:59Z')), '9 Oct');
  assert.equal(en.date(NaN), '');
});
test('translations contain the interface words and none is just a copy of English for key labels', () => {
  ['fr', 'de', 'nl', 'es', 'ro'].forEach((l) => {
    ['scanToView', 'badgeNew', 'badgeClosing', 'badgeFeatured'].forEach((k) => {
      assert.notEqual(DICT[l][k], DICT.en[k], l + ' ' + k + ' is translated');
    });
  });
});

/* ------------------------------------------------------------------ badge + selection logic */
const NOW = iso('2026-10-01T10:00:00Z');                                  // Thursday 1 Oct 2026, 11:00 BST
const DAY = 86400000;
function job(over) {
  return Object.assign({ id: '1', title: 'Job', reference: 'REF1', location: 'Fivemiletown, Co. Tyrone', department: 'Quality',
    employmentType: 'Permanent', workPattern: 'Full-time', remote: false, postedMs: NOW - 10 * DAY, closingMs: NOW + 20 * DAY, summary: '', url: '' }, over);
}
test('London day: DST edges', () => {
  assert.equal(londonDay(iso('2026-03-29T00:30:00Z')), londonDay(iso('2026-03-29T01:30:00Z')));
  assert.equal(londonDay(iso('2026-10-24T23:30:00Z')), londonDay(iso('2026-10-25T12:00:00Z')));   // 00:30 BST on the 25th
  assert.notEqual(londonDay(iso('2026-10-24T22:30:00Z')), londonDay(iso('2026-10-24T23:30:00Z')));
  assert.equal(londonDay(iso('2026-10-02T00:00:00Z')) - londonDay(iso('2026-10-01T00:00:00Z')), 1);
});
test('badges: new / closing soon / featured', () => {
  const cfg = cfgOf('?featured=REF9');
  const fresh = describeJob(job({ postedMs: NOW - 2 * DAY }), cfg, NOW);
  assert.deepEqual(fresh.badges, ['new']);
  assert.deepEqual(describeJob(job({ postedMs: NOW - 7 * DAY }), cfg, NOW).badges, ['new']);        // boundary: 7 days is still new
  assert.deepEqual(describeJob(job({ postedMs: NOW - 8 * DAY }), cfg, NOW).badges, []);
  assert.deepEqual(describeJob(job({ closingMs: NOW + 3 * DAY }), cfg, NOW).badges, ['closing']);   // boundary: 3 days
  assert.deepEqual(describeJob(job({ closingMs: NOW + 4 * DAY }), cfg, NOW).badges, []);
  assert.deepEqual(describeJob(job({ reference: 'ref9' }), cfg, NOW).badges, ['featured']);
  assert.deepEqual(describeJob(job({ id: 'REF9' }), cfg, NOW).badges, ['featured']);                 // by id too, any case
  assert.deepEqual(describeJob(job({ reference: 'REF9', postedMs: NOW - DAY, closingMs: NOW + DAY }), cfg, NOW).badges, ['closing', 'featured', 'new']);
});
test('badges follow the settings', () => {
  const j = job({ postedMs: NOW - DAY, closingMs: NOW + DAY });
  assert.deepEqual(describeJob(j, cfgOf('?showNew=0'), NOW).badges, ['closing']);
  assert.deepEqual(describeJob(j, cfgOf('?showClosingSoon=0'), NOW).badges, ['new']);
  assert.deepEqual(describeJob(j, cfgOf('?closingDays=0'), NOW).badges, ['new']);
  assert.deepEqual(describeJob(j, cfgOf('?newDays=1&closingDays=1'), NOW).badges, ['closing', 'new']);
  assert.deepEqual(describeJob(job({ reference: 'REF1', postedMs: NOW - 30 * DAY }), cfgOf('?featured=ref1&showFeatured=0'), NOW).badges, []);
});
test('closing date at 23:59:59 London time means "closes today", then it is gone', () => {
  const closing = iso('2026-10-01T22:59:59Z');                              // 23:59:59 BST
  const j = job({ closingMs: closing });
  assert.equal(describeJob(j, cfgOf(''), NOW).closeDays, 0);
  assert.ok(isOpen(j, NOW));
  assert.ok(!isOpen(j, iso('2026-10-01T23:00:00Z')));
});
test('missing dates do not crash or badge', () => {
  const d = describeJob(job({ postedMs: NaN, closingMs: NaN }), cfgOf(''), NOW);
  assert.deepEqual(d.badges, []); assert.ok(isOpen(job({ closingMs: NaN }), NOW));
});
test('selection: closed vacancies are dropped, filters and limit apply', () => {
  const jobs = [
    job({ id: 'a', title: 'A', closingMs: NOW - 1 }),
    job({ id: 'b', title: 'B', location: 'Dungannon', department: 'IT' }),
    job({ id: 'c', title: 'C', location: 'Fivemiletown', department: 'Quality' }),
    job({ id: 'd', title: 'D', location: 'Wrexham', department: 'Logistics', employmentType: 'Fixed term' })
  ];
  assert.deepEqual(selectVacancies(jobs, cfgOf(''), NOW).map((i) => i.id).sort(), ['b', 'c', 'd']);
  assert.deepEqual(selectVacancies(jobs, cfgOf('?location=dungannon'), NOW).map((i) => i.id), ['b']);
  assert.deepEqual(selectVacancies(jobs, cfgOf('?department=quality'), NOW).map((i) => i.id), ['c']);
  assert.deepEqual(selectVacancies(jobs, cfgOf('?type=fixed'), NOW).map((i) => i.id), ['d']);
  assert.equal(selectVacancies(jobs, cfgOf('?limit=2'), NOW).length, 2);
});
test('sorting: priority, newest, closing, title', () => {
  const jobs = [
    job({ id: 'old', title: 'Zed', postedMs: NOW - 20 * DAY, closingMs: NOW + 30 * DAY }),
    job({ id: 'new', title: 'Bee', postedMs: NOW - 1 * DAY, closingMs: NOW + 25 * DAY }),
    job({ id: 'soon', title: 'Cee', postedMs: NOW - 15 * DAY, closingMs: NOW + 2 * DAY }),
    job({ id: 'feat', title: 'Dee', reference: 'F1', postedMs: NOW - 12 * DAY, closingMs: NOW + 28 * DAY })
  ];
  const ids = (q) => selectVacancies(jobs, cfgOf(q), NOW).map((i) => i.id);
  assert.deepEqual(ids('?featured=f1'), ['feat', 'soon', 'new', 'old']);
  assert.deepEqual(ids('?sort=newest'), ['new', 'feat', 'soon', 'old']);
  assert.deepEqual(ids('?sort=closing'), ['soon', 'new', 'feat', 'old']);
  assert.deepEqual(ids('?sort=title'), ['new', 'soon', 'feat', 'old']);
});
test('hero: rotates through every vacancy; ?job= pins one; ?hero= re-orders', () => {
  const jobs = [
    job({ id: 'a', reference: 'RA', title: 'A', postedMs: NOW - 9 * DAY, closingMs: NOW + 5 * DAY }),
    job({ id: 'b', reference: 'RB', title: 'B', postedMs: NOW - 1 * DAY, closingMs: NOW + 9 * DAY }),
    job({ id: 'c', reference: 'RC', title: 'C', postedMs: NOW - 5 * DAY, closingMs: NOW + 2 * DAY })
  ];
  const seq = (q) => { const c = cfgOf(q); const r = heroSequence(selectVacancies(jobs, c, NOW), c); return { ids: r.items.map((i) => i.id), reason: r.reason }; };
  /* default: ALL open vacancies, in the sort order (closing soon, then new, then newest) - not one "winner" */
  assert.deepEqual(seq('?mode=hero').ids, ['c', 'b', 'a']);
  assert.equal(seq('?mode=hero').ids.length, 3);
  assert.deepEqual(seq('?mode=hero&sort=title').ids, ['a', 'b', 'c']);
  assert.deepEqual(seq('?mode=hero&hero=featured&featured=ra').ids, ['a', 'c', 'b']);   // featured first, the rest keep their order
  assert.deepEqual(seq('?mode=hero&hero=newest').ids, ['b', 'c', 'a']);
  assert.deepEqual(seq('?mode=hero&hero=closing').ids, ['c', 'a', 'b']);
  /* ?job= is the one way to keep a single vacancy on screen */
  assert.deepEqual(seq('?mode=hero&job=ra').ids, ['a']); assert.equal(seq('?mode=hero&job=ra').reason, 'job');
  assert.deepEqual(seq('?mode=hero&job=a').ids, ['a']);
  assert.deepEqual(seq('?mode=hero&job=nothing').ids, ['c', 'b', 'a']);                   // not open -> normal rotation
  assert.deepEqual(heroSequence([], cfgOf('')).items, []);
  /* one vacancy in total: one screen, so it simply stays up */
  assert.equal(groupSlides(heroSequence(selectVacancies(jobs.slice(0, 1), cfgOf(''), NOW), cfgOf('')).items, 1).length, 1);
});
test('screens: one vacancy each (hero, carousel) or pairs 1+2, 3+4, 5+6 (duo); every vacancy appears', () => {
  const ten = Array.from({ length: 10 }, (_, i) => ({ id: 'v' + (i + 1) }));
  const ids = (g) => g.map((x) => x.id).join('+');
  assert.deepEqual(groupSlides(ten, 2).map(ids), ['v1+v2', 'v3+v4', 'v5+v6', 'v7+v8', 'v9+v10']);
  assert.deepEqual(groupSlides(ten, 1).map(ids), ten.map((x) => x.id));
  /* an odd number: the last screen is completed with the first vacancy, so no screen is half empty */
  assert.deepEqual(groupSlides(ten.slice(0, 5), 2).map(ids), ['v1+v2', 'v3+v4', 'v5+v1']);
  assert.deepEqual(groupSlides(ten.slice(0, 1), 2).map(ids), ['v1']);              // a lone vacancy is shown on its own
  assert.deepEqual(groupSlides([], 2), []);
  const seen = new Set(); groupSlides(ten.slice(0, 7), 2).forEach((g) => g.forEach((x) => seen.add(x.id)));
  assert.equal(seen.size, 7);
});
test('short location', () => {
  assert.equal(shortLocation('Fivemiletown, Co. Tyrone, Northern Ireland'), 'Fivemiletown');
  assert.equal(shortLocation('Fivemiletown, Co. Tyrone', true), 'Fivemiletown, Co. Tyrone');
  assert.equal(shortLocation(''), '');
});

/* ------------------------------------------------------------------ layout engine */
const area = { areaW: 1808, areaH: 770, gap: 28 };
test('layout: automatic grids by orientation and card size', () => {
  const L = (o) => computeWallLayout(Object.assign({ n: 30, orientation: 'landscape', cardsize: 'medium', columns: 0, rows: 0 }, area, o));
  assert.deepEqual([L({ cardsize: 'small' }).cols, L({ cardsize: 'small' }).rows], [4, 3]);
  assert.deepEqual([L({}).cols, L({}).rows], [3, 2]);
  assert.deepEqual([L({ cardsize: 'large' }).cols, L({ cardsize: 'large' }).rows], [2, 1]);
  assert.deepEqual([L({ orientation: 'portrait' }).cols, L({ orientation: 'portrait' }).rows], [2, 3]);
  assert.deepEqual([L({ orientation: 'portrait', cardsize: 'large' }).cols, L({ orientation: 'portrait', cardsize: 'large' }).rows], [1, 2]);
});
test('layout: explicit columns / rows are respected and clamped', () => {
  const L = (o) => computeWallLayout(Object.assign({ n: 30, orientation: 'landscape', cardsize: 'medium', columns: 0, rows: 0 }, area, o));
  assert.equal(L({ columns: 5 }).cols, 5); assert.ok(L({ columns: 5 }).rows >= 1);
  assert.equal(L({ columns: 2, rows: 2 }).perPage, 4);
  assert.equal(L({ columns: 99 }).cols, 10);
});
test('layout: pages are split evenly (13 over 3 pages is 5+4+4)', () => {
  const l = computeWallLayout(Object.assign({ n: 13, orientation: 'landscape', cardsize: 'small', columns: 0, rows: 0 }, area)); // 12 per page -> 2 pages
  assert.equal(l.pages, 2); assert.deepEqual(l.sizes, [7, 6]);
  const l2 = computeWallLayout(Object.assign({ n: 13, orientation: 'landscape', cardsize: 'medium', columns: 0, rows: 0 }, area)); // 6 per page
  assert.equal(l2.pages, 3); assert.deepEqual(l2.sizes, [5, 4, 4]);
  assert.deepEqual(sliceIntoPages([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13], l2.sizes).map((p) => p.length), [5, 4, 4]);
});
test('layout: few vacancies get bigger cards but never absurdly big; nothing overflows the area', () => {
  const one = computeWallLayout(Object.assign({ n: 1, orientation: 'landscape', cardsize: 'medium', columns: 0, rows: 0 }, area));
  const six = computeWallLayout(Object.assign({ n: 6, orientation: 'landscape', cardsize: 'medium', columns: 0, rows: 0 }, area));
  assert.ok(one.cardW <= six.cardW * 1.45 + 0.01 && one.cardH <= six.cardH * 1.45 + 0.01);
  assert.ok(one.cardW >= six.cardW);
  [0, 1, 2, 5, 6, 7, 13, 40].forEach((n) => ['small', 'medium', 'large'].forEach((cs) => ['landscape', 'portrait'].forEach((o) => {
    const l = computeWallLayout(Object.assign({ n, orientation: o, cardsize: cs, columns: 0, rows: 0 }, area));
    assert.ok(l.cardW * l.colsUsed + (l.colsUsed - 1) * l.gap <= area.areaW + 0.5, 'width fits n=' + n + cs + o);
    assert.ok(l.cardH * l.rowsUsed + (l.rowsUsed - 1) * l.gap <= area.areaH + 0.5, 'height fits n=' + n + cs + o);
    assert.equal(l.sizes.reduce((a, b) => a + b, 0), n);
    assert.ok(l.c > 0 && isFinite(l.c));
  })));
});
test('layout: tiny and huge areas do not produce NaN', () => {
  [[10, 10], [300, 200], [7680, 4320]].forEach(([w, h]) => {
    const l = computeWallLayout({ n: 9, areaW: w, areaH: h, gap: 28, orientation: w > h ? 'landscape' : 'portrait', cardsize: 'medium', columns: 0, rows: 0 });
    assert.ok(isFinite(l.cardW) && isFinite(l.cardH) && isFinite(l.c) && l.cardW >= 1 && l.cardH >= 1);
  });
});

/* ------------------------------------------------------------------ data layer */
const GOOD_URL = 'https://' + CAREERS_HOST + '/job/12345';
test('safeUrl allows only https on the careers host', () => {
  assert.equal(safeUrl(GOOD_URL), GOOD_URL);
  ['http://' + CAREERS_HOST + '/x', 'https://evil.example/x', 'https://' + CAREERS_HOST + '.evil.example/x', 'javascript:alert(1)',
    'https://user:pw@' + CAREERS_HOST + '/x', '//' + CAREERS_HOST + '/x', '', null, undefined, 42, 'data:text/html,hi'].forEach((u) => assert.equal(safeUrl(u), '', String(u)));
});
test('parsePayload validates, cleans and de-duplicates', () => {
  const p = parsePayload({
    jobs: [
      { id: 1, title: ' Fitter\u0007 ', location: 'X', postedDate: '2026-09-30T08:00:00Z', closingDate: 'nonsense', url: GOOD_URL, overview: 'First para.\n\nSecond para.' },
      { id: '1', title: 'Duplicate id' }, { title: 'No id' }, { id: '3' }, null, 'str', [],
      { id: '4', title: 'Bad link', url: 'https://evil.example' }
    ],
    meta: { fetchedAt: '2026-10-01T08:00:00Z', nextRefreshAt: '2026-10-01T12:00:00Z', stale: true }
  });
  assert.deepEqual(p.jobs.map((j) => j.id), ['1', '4']);
  assert.equal(p.jobs[0].title, 'Fitter'); assert.ok(isNaN(p.jobs[0].closingMs)); assert.equal(p.jobs[1].url, '');
  assert.equal(p.jobs[0].overview, 'First para.\n\nSecond para.'); assert.equal(p.jobs[1].overview, '');
  assert.equal(p.serverStale, true); assert.equal(p.fetchedMs, iso('2026-10-01T08:00:00Z'));
});
test('parsePayload: empty list is valid (nothing open); garbage is rejected', () => {
  assert.equal(parsePayload({ jobs: [] }).jobs.length, 0);
  assert.throws(() => parsePayload(null)); assert.throws(() => parsePayload({})); assert.throws(() => parsePayload({ jobs: 'x' }));
  assert.throws(() => parsePayload({ jobs: [{ nope: 1 }] }));              // had entries but none usable -> treat as a failed fetch
});

/* ------------------------------------------------------------------ misc */
test('nightly reload time is the next London 03:30, across DST', () => {
  assert.equal(nextLondonTime(iso('2026-10-01T10:00:00Z'), 210), iso('2026-10-02T02:30:00Z'));   // 03:30 BST
  assert.equal(nextLondonTime(iso('2026-12-01T10:00:00Z'), 210), iso('2026-12-02T03:30:00Z'));   // 03:30 GMT
  assert.equal(nextLondonTime(iso('2026-10-02T01:00:00Z'), 210), iso('2026-10-02T02:30:00Z'));   // later the same night
  assert.equal(nextLondonTime(iso('2026-10-02T02:30:00Z'), 210), iso('2026-10-03T02:30:00Z'));   // exactly now -> tomorrow
  /* the nights the clocks change: still the right wall-clock time */
  assert.equal(nextLondonTime(iso('2026-10-24T12:00:00Z'), 150), iso('2026-10-25T02:30:00Z'));   // 02:30 GMT after the clocks go back
  assert.equal(nextLondonTime(iso('2026-03-28T12:00:00Z'), 210), iso('2026-03-29T02:30:00Z'));   // 03:30 BST after they go forward
  assert.equal(nextLondonTime(iso('2026-03-28T12:00:00Z'), 150), iso('2026-03-29T01:30:00Z'));   // 02:30 BST
});
test('QR: the real vacancy links encode (version <= 10) and the path is well formed', () => {
  const url = 'https://' + CAREERS_HOST + '/job/942545';
  assert.ok(encodeQR(url, { ecl: 'M' }).version <= 4);                      // a vacancy-page link is a small, easy-to-scan code
  const long = 'https://' + CAREERS_HOST + '/Apply/' + 'x'.repeat(100) + '?i=' + 'y'.repeat(30);
  const q = encodeQR(long, { ecl: 'M' });
  assert.ok(q.version >= 1 && q.version <= 10); assert.equal(q.size, 17 + 4 * q.version);
  const p = qrToPath(q, 4);
  assert.equal(p.size, q.size + 8); assert.ok(/^M/.test(p.d));
  assert.throws(() => encodeQR('x'.repeat(5000), { ecl: 'M' }));
});

/* ------------------------------------------------------------------ documentation */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
test('docs/URL-PARAMETERS.md matches the SCHEMA (run node tools/params-doc.mjs to refresh it)', () => {
  const doc = readFileSync(join(ROOT, 'docs', 'URL-PARAMETERS.md'), 'utf8');
  assert.equal(paramDocUpdated(doc), doc);
});
test('source safety: no innerHTML, eval, inline script / style, event-handler attributes or external scripts', () => {
  const files = [join(ROOT, 'index.html'), join(ROOT, 'admin.html')];
  (function walk(dir) {
    readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full); else if (/\.js$/.test(entry.name)) files.push(full);
    });
  })(join(ROOT, 'assets', 'js'));
  const patterns = [/innerHTML/, /outerHTML/, /insertAdjacentHTML/, /document\.write/, /\beval\(/, /new Function/, /\bsetTimeout\(\s*['"`]/, /\bsetInterval\(\s*['"`]/,
    /cssText/, /setAttribute\(\s*['"]style['"]/];
  const htmlPatterns = [/<script(?![^>]*\bsrc=)[^>]*>\s*\S/i, /<style[\s>]/i, /\sstyle\s*=/i, /\son[a-z]+\s*=\s*["']/i, /<script[^>]+src=["']https?:/i];
  const hits = [];
  files.forEach((file) => {
    const text = readFileSync(file, 'utf8');
    patterns.concat(/\.html$/.test(file) ? htmlPatterns : []).forEach((re) => { if (re.test(text)) hits.push(file.slice(ROOT.length + 1) + ' ' + re); });
  });
  assert.deepEqual(hits, []);
});
test('relative links in README.md and docs/*.md point at files that exist', () => {
  const files = [join(ROOT, 'README.md')].concat(readdirSync(join(ROOT, 'docs')).filter((f) => f.endsWith('.md')).map((f) => join(ROOT, 'docs', f)));
  const broken = [];
  files.forEach((file) => {
    const text = readFileSync(file, 'utf8').replace(/```[\s\S]*?```/g, '');
    (text.match(/\]\(([^)\s]+)\)/g) || []).forEach((link) => {
      const target = link.slice(2, -1).split('#')[0];
      if (!target || /^(https?:|mailto:)/.test(target)) return;
      if (!existsSync(join(dirname(file), target))) broken.push(file.slice(ROOT.length + 1) + ' -> ' + target);
    });
  });
  assert.deepEqual(broken, []);
});

test('Workers deployment files: wrangler.jsonc points at worker.js and the assets folder; .assetsignore keeps non-website files out', () => {
  const w = JSON.parse(readFileSync(join(ROOT, 'wrangler.jsonc'), 'utf8').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n'));
  assert.equal(w.main, 'worker.js'); assert.ok(existsSync(join(ROOT, w.main)));
  assert.equal(w.assets.binding, 'ASSETS'); assert.equal(w.assets.directory, './');
  assert.ok(!('pages_build_output_dir' in w), 'a Pages build would then treat this as its configuration');
  const ignored = readFileSync(join(ROOT, '.assetsignore'), 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && l[0] !== '#');
  ['/worker.js', '/wrangler.jsonc', '/functions', '/tests', '/tools', '/docs', '/README.md', '/.assetsignore'].forEach((p) => assert.ok(ignored.includes(p), p + ' missing from .assetsignore'));
  ['index.html', 'admin.html', 'assets'].forEach((p) => assert.ok(existsSync(join(ROOT, p)) && !ignored.includes('/' + p), p + ' must stay public'));
  const worker = readFileSync(join(ROOT, 'worker.js'), 'utf8');
  assert.ok(/pathname === '\/api\/jobs'/.test(worker), 'only the exact path /api/jobs may reach the handler');
});

/* ------------------------------------------------------------------ */
if (failures.length) {
  console.error(failures.length + ' failed, ' + passed + ' passed\n');
  failures.forEach((f) => console.error('FAIL ' + f + '\n'));
  process.exit(1);
}
console.log('all ' + passed + ' unit tests passed');
