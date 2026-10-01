# Architecture and component design

The first version was one page with a search box and a list of cards. This version keeps its working data path exactly as it
was and builds a configurable display platform on top of it.

**What did not change:** how vacancies are retrieved. `functions/api/jobs.js` (the function that talks to Talos – a Cloudflare Pages Function, also run by
`worker.js` on a Workers deployment) still sends the same fixed request to the same fixed address, applies the 08:00 / 12:00 London refresh slots, caches and de-duplicates exactly as
before. **Version 2.1 added to it, without removing anything:** an `overview` field (the opening section of the vacancy's full description, cut before the
first sub-heading, list or table) and the vacancy link now points at the full vacancy page (`/job/<id>`) instead of the application form. The cache key changed (`jobs-v2`) so a
copy cached by an older version is never read. Everything below sits on the browser side of `/api/jobs`.

## The layers

```
 Talos ATS ──► /api/jobs  (function; Pages runs it, or worker.js on Workers; retrieval unchanged)
                  │  JSON: { jobs:[…], meta:{count, fetchedAt, nextRefreshAt, stale}, diagnostics? }
                  ▼
 ┌─────────────────────────── DATA LAYER (no DOM, knows nothing about screens) ─────────────────────────┐
 │ store.js        fetch · validate · saved copy · back-off · polling · health                          │
 │ vacancies.js    filter · sort · badges (New / Featured / Closing soon) · rotation order · London days │
 └───────────────────────────────────────────────────────────────────────────────────────────────────────┘
                  │  view = { status, items, health, dataTimeMs, now }      ◄── one dataset, every mode
                  ▼
 ┌──────────────────────────────── PRESENTATION LAYER (reads a view, draws it) ─────────────────────────┐
 │ main.js         start-up, builds the view, picks the mode, feeds the screen-reader list              │
 │ modes/          wall · carousel · hero · duo · widget · ticker (kiosk = wall + kiosk behaviours)     │
 │ slideshow.js    the rotation that hero, duo and carousel share                                       │
 │ components.js   badges, facts, card, feature slide, duo panel, brand header, status, QR, fitting     │
 │ layout.js       wall grid arithmetic             stage.js    screen size, rotation, scale unit       │
 │ i18n.js         six languages                    themes.css + app.css    colours and layout          │
 └───────────────────────────────────────────────────────────────────────────────────────────────────────┘
                  ▲
 config.js        every setting comes from the address (one SCHEMA drives parsing, the Display builder and the docs)
 runtime.js       long-running housekeeping: pause when hidden, wake lock, nightly reload, error watchdog, ?diag=1
```

The two rules that make this work:

1. **The data layer never imports a mode, a component or the DOM.** It can be unit-tested in Node, and replacing the display
   cannot break data retrieval.
2. **A mode never fetches.** It receives a *view* and draws it. All the modes show the same dataset because they all get the
   same view from `main.js`.

## Data flow, step by step

1. `main.js` calls `parseConfig(location.search)` → `cfg` (validated, defaults filled in) plus a list of ignored settings.
2. `createI18n(cfg.lang)`, `createStage(...)`, `createStore(...)` are created; the chosen mode is mounted.
3. `store.start()` fetches `/api/jobs`. The payload is checked field by field (`parsePayload`): text is cleaned and
   length-limited, vacancies without an ID or title are dropped, duplicates removed, and a link is kept **only** if it is
   `https://` on `cooneensgroup1.talosats-careers.com`. A good payload is also saved in `localStorage` (vacancy data only).
4. Each time the store changes (and every 30 seconds from the heartbeat, so "closes tomorrow" turns into "closes today" on its
   own), `main.js` builds the **view**:

   | Field | Meaning |
   |---|---|
   | `status` | `loading` · `failed` (no data and none saved) · `empty` (nothing to show after filters) · `ok` |
   | `items` | open vacancies after filters, sorted, limited; each `{ job, id, featured, isNew, closingSoon, closeDays, postedDays, badges[] }` |
   | `health` | `fresh` · `stale` (server serving an older copy) · `offline` (can't reach the service for a while) · `saved` (showing the browser's saved copy) · `old` (data over 26 h old) · `none` |
   | `dataTimeMs` | when the data on screen is really from |
   | `now` | the time the view was built |

5. A cheap key (`status | health | minute | signature(items)`) is compared with the last one. **If nothing visible changed, the
   screen is not touched** – a screen that runs for weeks does not redraw for no reason.
6. Otherwise `mode.update(view)` redraws, and `updateSr(view)` refreshes the off-screen list for screen readers.

### The store (data layer)

| Behaviour | How |
|---|---|
| Normal polling | every `refresh` minutes (default 10) ±10 %, so many screens do not call at the same moment |
| Slot awareness | after the server's next 08:00 / 12:00 refresh time, checks again 20–120 s later |
| Failure | back-off 30 s, 60 s, 120 s … never longer than the refresh interval |
| No data on start-up | uses the saved copy (`health = saved`); only if there is no saved copy is the screen in the `failed` state |
| Server problems on a working screen | keeps showing what it has; once checks have been failing for 15 minutes (or 1.5 × the refresh interval, whichever is longer), shows an "offline" notice with the time of the data |
| Garbage from the server | rejected by `parsePayload`; the screen keeps its current data |
| Network returns / screen wakes | `wake()` retries within seconds (never more than one check per 5 s) |

### Vacancy logic (data layer, pure)

`selectVacancies(jobs, cfg, now)` → hides vacancies whose closing time has passed, applies `location` / `department` / `type`
filters, computes badges, sorts (`priority` = Featured, Closing soon, New, then newest), and applies `limit`.
`heroSequence(items, cfg)` decides what the hero (and duo and carousel) rotate through: **every** vacancy in the display order, or the one pinned
with `job=`; `groupSlides(items, size)` pairs them for the duo (1 + 2, 3 + 4 …, an odd last vacancy is paired with the first). Dates are **London calendar days** (`londonDay`, via `Intl`), because Talos
closing dates are end-of-day London time (22:59:59 UTC in summer) and "closes tomorrow" must be right across midnight and
daylight-saving changes.

Talos has no "featured" flag, so *Featured* is a display setting: `?featured=ref1,ref2`.

## Component design

| Module | Responsibility | Used by |
|---|---|---|
| `config.js` | `SCHEMA` (every parameter: type, range, default, description, which modes use it) · `parseConfig` · derived values (`layout`, `controls`, `links`, `refreshMs`…) | main, admin, docs generator, tests |
| `i18n.js` | `DICT` for en/fr/de/nl/es/ro · `createI18n(lang)` → `t(key, vars)`, `date()`, `time()` · `validateDictionary()` | every component |
| `stage.js` | measures the window, applies `rotate`, sets the scale unit `--d`, decides landscape/portrait, notifies on change | main, modes |
| `layout.js` | `computeWallLayout`, `sliceIntoPages` (pure arithmetic) | wall |
| `components.js` | `createBadges` `createFacts` `createTiming` `createCard` `createFeature` `createDuoPanel` `createDescription` `createBrandPlate` (the logo) `createHeader` (the INTERNAL VACANCIES band) `createStatus` `createControls` `createStatePanel` `buildPager` `createQr` and the fitting helpers `fitCards` `fitFeature` `fitDuo` `fitText` `fitOneLine` | modes |
| `slideshow.js` | `mountSlideshow(ctx, { name, size, sequence, create, fit, footer })`: the rotation, progress bar, fades and "same vacancies, redraw only" logic that hero, duo and carousel share | hero, duo, carousel |
| `qr.js` | QR encoder (see [QR.md](QR.md)) | components |
| `rotator.js` | one pausable timer for page/slide rotation (holds freeze the countdown and resume with the time left) | wall, slideshow |
| `runtime.js` | housekeeping for long uptime, keyboard, `?diag=1` panel | main |
| `dom.js` | `el`, `svgEl`, `clear`, `icon`: DOM helpers that only ever create text nodes (**no `innerHTML` anywhere**) | everything |
| `modes/*.js` | one file per display mode | main |
| `themes.css` | colour tokens only | all |
| `app.css` | layout, sizes (all in `--d` units), motion | all |

### The mode contract

Every file in `modes/` exports `mount(ctx)` and returns the same small interface:

```js
export function mount(ctx) {
  // ctx = { app, cfg, i18n, stage, store, reducedMotion, links, notes, announce(msg), setPaused(bool) }
  // build your DOM inside ctx.app once
  return {
    update(view) {},        // required: draw this view (called only when something visible changed)
    resize() {},            // optional: the screen size / orientation changed
    refit() {},             // optional: re-measure text (the web font arrived)
    tick(nowMs) {},         // optional: once every 30 s (e.g. refresh "closes in 2 days" wording)
    next() {}, prev() {},   // optional: keyboard / buttons
    togglePause() {},       // optional
    hold(reason, on) {},    // optional: freeze rotation (e.g. 'hidden')
    info() { return {}; },  // optional: shown in ?diag=1
    destroy() {}            // optional: remove timers and listeners
  };
}
```

### How to add a display mode

1. Create `assets/js/modes/<name>.js` implementing the contract above (use `components.js` for cards, badges, QR).
2. Import it in `main.js` and add it to `MODES`.
3. Add the name to `MODES` in `config.js` and (if it has its own defaults) to `resolve()` there.
4. Add CSS under a `.mode-<name>` block in `app.css` using only `--d` units and theme tokens.
5. Add `modes` entries to any `SCHEMA` item that should apply to it. The Display builder, `?diag=1` and
   `docs/URL-PARAMETERS.md` (`node tools/params-doc.mjs`) follow automatically.

### How to add a parameter

Add one entry to `SCHEMA` in `config.js` (`key`, `type`, `def`, `group`, `desc`, optional `modes`). It is then parsed,
validated, listed in the Display builder and documented. Use it where needed through `ctx.cfg.<key>`.

## Why one deployment serves every use

Nothing about a screen is stored in code or on a server. A screen *is* its address. Yodeck, SharePoint, Teams, the intranet and a
canteen TV all load the same files from the same Cloudflare project; only the query string differs. The Display builder at `/admin`
produces that query string; it stores nothing.

## Security properties

- `/api/jobs` keeps its fixed upstream URL, fixed request body, not an open proxy, no CORS headers.
- The browser re-validates everything it receives and uses a link only if it is `https` on the careers host; links open with
  `rel="noopener noreferrer"`. Signage modes contain no links unless you ask for them with `links=1`.
- No `innerHTML`, `eval`, inline scripts or inline styles (styles are applied through the CSSOM). The page's
  Content-Security-Policy allows scripts and styles only from the site itself, fonts from `fonts.gstatic.com`, and data only
  from the site. (The Display builder additionally allows its preview frame from the same site.)
- Settings in the address are validated; text settings are length-limited, stripped of control characters and only ever
  displayed as text.
- No analytics, trackers or third-party scripts.

## Browser support

Chromium 84 or newer (Chrome, Edge, and the Chromium that most signage players use). Older browsers show a plain
"needs a newer browser" message instead of a broken screen.
