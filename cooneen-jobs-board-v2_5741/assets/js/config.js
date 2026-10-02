/* URL parameter system.
   One schema drives parsing, validation, defaults, the docs table and the admin builder page.
   Names are matched case-insensitively (?showLocation=0 and ?showlocation=0 are the same).
   Anything unknown or invalid is ignored (the default is used) and listed in ?diag=1. */

export const VERSION = '2.1.1';

export const MODES = ['wall', 'carousel', 'hero', 'duo', 'widget', 'ticker', 'kiosk'];
export const THEMES = ['cooneen', 'dark', 'light', 'highcontrast', 'portal'];
export const LANGS = ['en', 'fr', 'de', 'nl', 'es', 'ro'];

/* type: enum | intenum | bool | tri | int | num | text | list | time
   tri  = true / false, or "not set" (null) which means "use the default for this mode"
   def  = default value; null means "depends on the mode" and is resolved in resolve() below
   modes   = the display modes that read the setting (omitted = all); used by the Display builder and the docs
   defText = how to print a default that depends on something else (docs only) */
export const SCHEMA = [
  /* ---- Display ---- */
  { key: 'mode', type: 'enum', values: MODES, def: 'wall', group: 'Display',
    desc: 'Which display to show. hero = one vacancy per screen, duo = two side by side (both rotate through every vacancy), kiosk = wall plus signage behaviours.' },
  { key: 'theme', type: 'enum', values: THEMES, def: 'cooneen', group: 'Display',
    desc: 'Colour theme. cooneen = Cooneen orange and charcoal (default), portal matches the apps.cooneen.com staff portal.' },
  { key: 'lang', type: 'enum', values: LANGS, def: 'en', group: 'Display',
    desc: 'Interface language. Vacancy text stays in its original language.' },
  { key: 'kiosk', type: 'bool', def: false, group: 'Display',
    desc: 'Signage behaviours: no controls, no links (unless links=1), hidden cursor, screen kept awake, larger type.' },
  { key: 'orientation', type: 'enum', values: ['auto', 'landscape', 'portrait'], def: 'auto', group: 'Display',
    desc: 'Force the landscape or portrait arrangement. auto follows the screen shape.' },
  { key: 'rotate', type: 'intenum', values: [0, 90, 180, 270], def: 0, group: 'Display',
    desc: 'Turn the whole display clockwise by this many degrees (for screens mounted sideways or upside down).' },
  { key: 'title', type: 'text', max: 80, def: '', group: 'Display', modes: ['wall', 'kiosk', 'carousel', 'hero', 'duo', 'widget'],
    desc: 'Replace the heading text (for example "Fivemiletown opportunities"). The default is INTERNAL VACANCIES, which is best left as it is.' },
  { key: 'logoBg', type: 'enum', values: ['dark', 'light', 'none'], def: 'dark', group: 'Display', modes: ['wall', 'kiosk', 'carousel', 'hero', 'duo', 'widget', 'ticker'],
    desc: 'What the Cooneen logo sits on. dark (default) suits the white "reverse" logo; light suits a dark or colour logo; none draws it straight onto the heading band.' },
  { key: 'header', type: 'tri', def: null, group: 'Display', modes: ['wall', 'kiosk', 'carousel', 'hero', 'duo'],
    desc: 'Show the Cooneen heading band (logo and INTERNAL VACANCIES). Default: on. The widget and ticker always carry the same branding in their own form.' },
  { key: 'clock', type: 'tri', def: null, group: 'Display', modes: ['wall', 'kiosk', 'carousel', 'hero', 'duo'],
    desc: 'Show the time in the heading band. Default: on in kiosk mode.' },

  /* ---- Layout ---- */
  { key: 'columns', type: 'int', min: 0, max: 10, def: 0, group: 'Layout', modes: ['wall', 'kiosk'],
    desc: 'Columns in the wall. 0 = automatic.' },
  { key: 'rows', type: 'int', min: 0, max: 10, def: 0, group: 'Layout', modes: ['wall', 'kiosk', 'widget'],
    desc: 'Rows per page in the wall (0 = automatic), or vacancies listed in the widget (default 5).' },
  { key: 'cardsize', type: 'enum', values: ['small', 'medium', 'large'], def: 'medium', group: 'Layout',
    modes: ['wall', 'kiosk'], desc: 'How many cards fit on a page: small = more, large = fewer and bigger.' },
  { key: 'density', type: 'enum', values: ['comfortable', 'compact'], def: 'comfortable', group: 'Layout',
    modes: ['wall', 'kiosk'], desc: 'Spacing inside and between cards.' },
  { key: 'gap', type: 'int', min: 0, max: 120, def: null, defText: '`28` (`16` with density=compact)', group: 'Layout', modes: ['wall', 'kiosk'],
    desc: 'Space between cards, in design pixels (pixels on a 1080-pixel-high screen, scaled to the real screen).' },
  { key: 'fontscale', type: 'num', min: 0.5, max: 3, def: null, group: 'Layout',
    desc: 'Multiplies all text sizes. Default 1 (1.1 in kiosk mode).' },

  /* ---- Content ---- */
  { key: 'qr', type: 'tri', def: null, group: 'Content', modes: ['wall', 'kiosk', 'carousel', 'hero', 'duo'],
    desc: 'Show a QR code that opens the vacancy page (full details, with the Apply button). Default: on in hero and duo, off elsewhere.' },
  { key: 'showClosingSoon', type: 'bool', def: true, group: 'Content',
    desc: 'Highlight vacancies that close soon.' },
  { key: 'showFeatured', type: 'bool', def: true, group: 'Content',
    desc: 'Show the Featured badge (see the featured parameter).' },
  { key: 'showNew', type: 'bool', def: true, group: 'Content',
    desc: 'Show the New badge on recently posted vacancies.' },
  { key: 'showPostedDate', type: 'bool', def: true, group: 'Content', modes: ['wall', 'kiosk', 'carousel', 'hero', 'duo'],
    desc: 'Show when the vacancy was posted.' },
  { key: 'showLocation', type: 'bool', def: true, group: 'Content', desc: 'Show the location.' },
  { key: 'showDepartment', type: 'bool', def: true, group: 'Content', modes: ['wall', 'kiosk', 'carousel', 'hero', 'duo', 'widget'],
    desc: 'Show the department.' },
  { key: 'showType', type: 'bool', def: true, group: 'Content', modes: ['wall', 'kiosk', 'carousel', 'hero', 'duo'],
    desc: 'Show the employment type and working pattern.' },
  { key: 'showSummary', type: 'tri', def: null, group: 'Content', modes: ['wall', 'kiosk', 'carousel', 'hero', 'duo'],
    desc: 'Show the role description: the vacancy\'s own opening overview in hero, duo and carousel, a short summary on wall cards. Default: on in hero, duo and carousel, off in the wall.' },
  { key: 'showRef', type: 'bool', def: false, group: 'Content', modes: ['wall', 'kiosk', 'carousel', 'hero', 'duo'],
    desc: 'Show the vacancy reference code.' },
  { key: 'fullLocation', type: 'bool', def: false, group: 'Content',
    desc: 'Show the full location text instead of just the town.' },

  /* ---- Behaviour ---- */
  { key: 'rotation', type: 'num', min: 3, max: 600, def: null, group: 'Behaviour', modes: ['wall', 'kiosk', 'carousel', 'hero', 'duo'],
    desc: 'Seconds each page (wall) or screen (hero, duo, carousel) stays up. Default 40 for hero, duo and carousel, 20 for the wall.' },
  { key: 'speed', type: 'num', min: 0.3, max: 3, def: 1, group: 'Behaviour', modes: ['ticker'],
    desc: 'Ticker scroll speed multiplier.' },
  { key: 'motion', type: 'enum', values: ['auto', 'full', 'reduced'], def: 'auto', group: 'Behaviour',
    desc: 'auto follows the device setting. Use full if a signage PC has animations switched off.' },
  { key: 'links', type: 'tri', def: null, group: 'Behaviour',
    desc: 'Make vacancies clickable. Default: on in the widget only, so signage can never be navigated away.' },
  { key: 'refresh', type: 'int', min: 2, max: 240, def: 10, group: 'Behaviour',
    desc: 'Minutes between checks for new data. The server itself only refreshes from Talos at about 08:00 and 12:00.' },
  { key: 'reload', type: 'time', def: 210, group: 'Behaviour',
    desc: 'London time for the nightly page reload (HH:MM), or off. Keeps long-running screens fresh.' },
  { key: 'newDays', type: 'int', min: 1, max: 60, def: 7, group: 'Behaviour',
    desc: 'A vacancy is New for this many days after it is posted.' },
  { key: 'closingDays', type: 'int', min: 0, max: 60, def: 3, group: 'Behaviour',
    desc: 'A vacancy is Closing soon when it closes within this many days (0 = never).' },

  /* ---- Which vacancies ---- */
  { key: 'featured', type: 'list', def: [], group: 'Vacancies',
    desc: 'Comma-separated vacancy references or IDs to mark Featured and show first.' },
  { key: 'job', type: 'text', max: 100, def: '', group: 'Vacancies', modes: ['hero'],
    desc: 'Hero mode: keep showing only this vacancy (reference or ID) instead of rotating through all of them. If it is not open, hero rotates normally.' },
  { key: 'hero', type: 'enum', values: ['auto', 'featured', 'newest', 'closing'], def: 'auto', group: 'Vacancies',
    modes: ['hero'], desc: 'Hero mode order. auto = the sort order (below), featured = Featured vacancies first, newest / closing = re-order the rotation.' },
  { key: 'sort', type: 'enum', values: ['priority', 'newest', 'closing', 'title'], def: 'priority', group: 'Vacancies',
    desc: 'Order. priority = featured, closing soon, new, then newest.' },
  { key: 'limit', type: 'int', min: 0, max: 100, def: 0, group: 'Vacancies', desc: 'Show at most this many vacancies (0 = all).' },
  { key: 'location', type: 'list', def: [], group: 'Vacancies',
    desc: 'Only vacancies whose location contains one of these words (comma-separated).' },
  { key: 'department', type: 'list', def: [], group: 'Vacancies',
    desc: 'Only vacancies whose department contains one of these words.' },
  { key: 'type', type: 'list', def: [], group: 'Vacancies',
    desc: 'Only vacancies whose employment type or working pattern contains one of these words.' },

  /* ---- Support ---- */
  { key: 'diag', type: 'bool', def: false, group: 'Support',
    desc: 'Show a diagnostics panel (settings, data health, timings).' }
];

const SPEC_BY_LOWER = {};
SCHEMA.forEach((spec) => { SPEC_BY_LOWER[spec.key.toLowerCase()] = spec; });

/* Remove control characters and bidi overrides, then trim. */
function clean(value) {
  return String(value).replace(/[\u0000-\u001f\u007f‪-‮⁦-⁩]/g, '').trim();
}

function parseBool(s) {
  const v = s.toLowerCase();
  if (v === '' || v === '1' || v === 'true' || v === 'yes' || v === 'on' || v === 'y') return true;
  if (v === '0' || v === 'false' || v === 'no' || v === 'off' || v === 'n') return false;
  return null;
}

function parseValue(spec, input) {
  const s = clean(input);
  const ok = (value, note) => ({ ok: true, value, note });
  const bad = (problem) => ({ ok: false, problem });
  switch (spec.type) {
    case 'bool':
    case 'tri': {
      const b = parseBool(s);
      return b === null ? bad('expected 1/0 or true/false') : ok(b);
    }
    case 'enum': {
      const v = s.toLowerCase();
      return spec.values.indexOf(v) >= 0 ? ok(v) : bad('expected one of: ' + spec.values.join(', '));
    }
    case 'intenum': {
      if (!/^-?\d+$/.test(s)) return bad('expected one of: ' + spec.values.join(', '));
      const n = ((parseInt(s, 10) % 360) + 360) % 360;
      return spec.values.indexOf(n) >= 0 ? ok(n) : bad('expected one of: ' + spec.values.join(', '));
    }
    case 'int':
    case 'num': {
      const pattern = spec.type === 'int' ? /^-?\d+$/ : /^-?(\d+\.?\d*|\.\d+)$/;
      if (!pattern.test(s)) return bad('expected a number');
      let n = spec.type === 'int' ? parseInt(s, 10) : parseFloat(s);
      let note;
      if (n < spec.min) { n = spec.min; note = 'raised to the minimum ' + spec.min; }
      if (n > spec.max) { n = spec.max; note = 'lowered to the maximum ' + spec.max; }
      return ok(n, note);
    }
    case 'text':
      return ok(s.slice(0, spec.max || 200));
    case 'list': {
      const items = s.split(',').map((x) => clean(x).toLowerCase().slice(0, 100)).filter(Boolean).slice(0, 50);
      return ok(items);
    }
    case 'time': {
      const v = s.toLowerCase();
      if (v === 'off' || v === 'none' || v === 'never' || v === 'false' || v === '0') return ok(-1);
      const m = /^(\d{1,2}):(\d{2})$/.exec(v);
      if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return bad('expected HH:MM (for example 03:30) or off');
      return ok(Number(m[1]) * 60 + Number(m[2]));
    }
    default:
      return bad('unsupported type');
  }
}

/* Turn "not set" values into the right default for the chosen mode. */
function resolve(cfg) {
  cfg.layout = cfg.mode === 'kiosk' ? 'wall' : cfg.mode;
  cfg.kiosk = cfg.kiosk === true || cfg.mode === 'kiosk';
  const L = cfg.layout;
  if (cfg.header === null) cfg.header = L !== 'ticker';
  if (cfg.clock === null) cfg.clock = cfg.kiosk && cfg.header && L !== 'widget';
  if (cfg.qr === null) cfg.qr = L === 'hero' || L === 'duo';
  if (cfg.links === null) cfg.links = L === 'widget' && !cfg.kiosk;
  if (cfg.showSummary === null) cfg.showSummary = L === 'carousel' || L === 'hero' || L === 'duo';
  if (cfg.rows === 0 && L === 'widget') cfg.rows = 5;
  if (cfg.rotation === null) cfg.rotation = L === 'carousel' || L === 'hero' || L === 'duo' ? 40 : 20;
  if (cfg.fontscale === null) cfg.fontscale = cfg.kiosk ? 1.1 : 1;
  if (cfg.gap === null) cfg.gap = cfg.density === 'compact' ? 16 : 28;
  cfg.rotationMs = Math.round(cfg.rotation * 1000);
  cfg.refreshMs = cfg.refresh * 60 * 1000;
  /* On-screen paging buttons only where a person might be sitting at the screen. */
  cfg.controls = !cfg.kiosk && (L === 'wall' || L === 'carousel');
  return cfg;
}

export function parseConfig(search) {
  const raw = {};
  new URLSearchParams(search || '').forEach((value, key) => {
    const k = key.toLowerCase();
    if (!Object.prototype.hasOwnProperty.call(raw, k)) raw[k] = value;
  });

  const issues = [];
  const provided = {};
  const cfg = {};
  SCHEMA.forEach((spec) => {
    const lower = spec.key.toLowerCase();
    let value = Array.isArray(spec.def) ? spec.def.slice() : spec.def;
    if (Object.prototype.hasOwnProperty.call(raw, lower)) {
      const result = parseValue(spec, raw[lower]);
      if (result.ok) {
        value = result.value;
        provided[spec.key] = true;
        if (result.note) issues.push({ key: spec.key, value: raw[lower], problem: result.note });
      } else {
        issues.push({ key: spec.key, value: raw[lower], problem: result.problem + ' (default used)' });
      }
    }
    cfg[spec.key] = value;
  });
  Object.keys(raw).forEach((k) => {
    if (!SPEC_BY_LOWER[k]) issues.push({ key: k, value: raw[k], problem: 'unknown parameter (ignored)' });
  });

  cfg.provided = provided;
  return { cfg: resolve(cfg), issues };
}
