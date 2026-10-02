# Cooneen Group – Internal Recruitment Signage

One Cloudflare site (Pages or Workers) that shows the Cooneen Group's **internal vacancies** (from the Talos careers site) on reception, canteen,
factory and office screens, in SharePoint, Teams and the intranet – in seven display modes, five themes and six languages, all chosen
by **the address**, with no code change.

```
https://<your-site>/?mode=kiosk                 canteen / factory wall
https://<your-site>/?mode=hero                  reception: one vacancy very large with a QR code, every vacancy in turn (40 s each)
https://<your-site>/?mode=duo                   two vacancies side by side, every vacancy in turn, 16:9
https://<your-site>/?mode=carousel&kiosk=1      one vacancy at a time, portrait or landscape
https://<your-site>/?mode=widget&theme=light    SharePoint / Teams / intranet panel
https://<your-site>/?mode=ticker                scrolling INTERNAL VACANCIES strip
https://<your-site>/admin                       Display builder: pick the options, copy the address
```

It is **internal**: the aim is employee awareness of opportunities inside the group. Vacancies come only from Talos, through the existing
`/api/jobs` function; there is no sample or hard-coded vacancy anywhere in the display.

## Version 2.1.1: progress bar fix

The progress bar at the bottom of the hero, duo, carousel and wall screens could finish while the screen was still waiting to change (seen after a tab or
phone screen had been hidden), and it filled in visible steps. Now the bar is drawn **from the rotation timer itself**: it starts, pauses, resumes and
restarts together with the countdown, so it is full at the moment the screen changes and cannot get ahead of it. The fill is a sub-pixel transform, so it glides
instead of ticking, and each segment is up to 300 design pixels wide (it was 160), which makes the movement finer still. Changed files: `rotator.js`,
`components.js` (`buildPager`), `slideshow.js`, `modes/wall.js`, `runtime.js`, `app.css`; 3 new unit tests.

## What changed in version 2.1 (this refinement)

| | Before | Now |
|---|---|---|
| Hero mode | showed **one** vacancy and never changed (it was built to pick a single "best" one) | **rotates through every open vacancy**, each for **40 seconds** (`?rotation=`), and stays put only when there is one vacancy or `?job=` pins one |
| Role description | the 240-character search-results summary | the vacancy's own **overview**: its opening paragraph(s), up to the first list or section heading (see *Where the overview comes from*) |
| QR codes | pointed at the application route | open the **vacancy page** `https://cooneensgroup1.talosats-careers.com/job/<id>` (full details; the Apply button is on that page) |
| New mode | – | `?mode=duo`: two vacancies side by side (stacked on a portrait screen), paired 1+2, 3+4, ...; every vacancy appears |
| INTERNAL VACANCIES | different size and place in each mode (and missing from hero) | one **Cooneen heading band** (logo + INTERNAL VACANCIES) in every mode; the widget and ticker carry the same branding |
| Branding | navy and teal | Cooneen orange and charcoal, the Cooneen logo, Nunito (the portal's typeface); see [docs/BRANDING.md](docs/BRANDING.md) |
| Carousel | 15 s per vacancy, summary | 40 s per vacancy, with the overview |

Nothing was removed: no search boxes, filters or buttons were added; rotation, the QR model, translations, themes, kiosk, portrait and landscape
all remain. `?mode=hero` no longer has the "NOW HIRING" label (the heading band replaces it).

### Where the overview comes from

The Talos search call (`/api/jobs` already makes it, once per refresh) returns each vacancy's **full description as HTML** - the same text the
vacancy page shows. `functions/api/jobs.js` cuts the opening paragraph(s) out of it (`makeOverview()`): everything before the first list, table or
section heading (a heading is a bold-only line, an `<h1>`-`<h6>`, or a short line ending in a colon, such as "Responsibilities"), capped at 900 characters at the
end of a sentence. A leading label such as "About the role" is skipped. If a vacancy has no usable opening paragraph the screens fall back to the short summary.

This is **not** done by visiting each vacancy page. That page is an Angular app that draws itself in the browser, so a server-side fetch would get an empty shell, and it
would add one request per vacancy to every refresh. The data is the same and already in hand. `?diag=1` on `/api/jobs?diag=1` shows `withOverview` (how many vacancies got one).

## What changed from the first version

| | First version | This version |
|---|---|---|
| Data (`functions/api/jobs.js`: the Talos retrieval, caching at 08:00 / 12:00 London, link building) | working | **retrieval logic unchanged** – everything is built on top of it |
| Display | one page with search and filters | seven modes (wall, carousel, hero, duo, widget, ticker, kiosk), landscape and portrait, rotation by 90/180/270° |
| Settings | `?kiosk=1` | over 40 URL parameters (see [URL-PARAMETERS.md](docs/URL-PARAMETERS.md)); `?kiosk=1` still works |
| Look | one design | Cooneen (orange and charcoal), dark, light, high-contrast and staff-portal themes |
| Language | English | English, French, German, Dutch, Spanish, Romanian (interface only) |
| Extras | – | New / Featured / Closing soon badges, QR codes, accessibility work, long-uptime hardening, Display builder |

The old search-and-filter board is replaced. (Signage cannot be clicked or typed on, and the intranet widget lists vacancies and links to
the careers site, which has full search.) The previous version is in the earlier zip and your GitHub history.

## Deploying (Cloudflare)

The same folder deploys as a **Cloudflare Pages** project (address ends `.pages.dev`) **or** as a **Cloudflare Worker** (address ends `.workers.dev`). Both serve the
same display and the same `/api/jobs`; use one of them. **`index.html`, `admin.html`, `assets/`, `functions/`, `worker.js`, `wrangler.jsonc` and `.assetsignore` must be at the repository root.**

> **"Vacancies can't be loaded right now" on a `.workers.dev` address** means the Worker was serving only the static files: a Worker does not run the `functions/` folder (only Pages does).
> `worker.js` and `wrangler.jsonc` in this folder fix that: they route `/api/jobs` to the same function. If `?mode=kiosk` (and the other `?mode=` addresses) changes nothing, the
> site is still running the first version: push this folder to the repository first.

### Option A – Cloudflare Worker (`*.workers.dev`)

1. Put the contents of this folder in the root of the GitHub repository the Worker is connected to, commit and push.
2. Dashboard → **Workers & Pages** → your Worker → **Settings** → **Build**. Leave the **build command** empty and the **deploy command** as `npx wrangler deploy`.
   `wrangler.jsonc` names the Worker `cooneenjobs1`; if your Worker has another name (it is the first part of its `workers.dev` address), change `"name"` there to match, otherwise the build fails on the name.
3. The push starts a build; when it is green open `https://<worker>.<subdomain>.workers.dev/api/jobs?diag=1` (data) and `/?mode=kiosk` (display).
4. A new Worker instead: **Create** → **Import a repository** (Workers), same settings.

`.assetsignore` keeps `functions/`, `tests/`, `tools/`, `docs/`, the README and the Worker files out of the public website. On a `*.workers.dev` address Cloudflare's shared cache is
not available, so each Worker instance keeps its own copy in memory and may ask Talos more often than the twice-a-day schedule (never more than once per instance per slot while it stays running);
a custom domain gets the shared cache.

### Option B – Cloudflare Pages (`*.pages.dev`)

1. Put the contents of this folder in a GitHub repository (the `docs/`, `tests/` and `tools/` folders are optional for the live site).
2. Cloudflare dashboard → **Workers & Pages** → **Create** → **Pages** → **Connect to Git** → choose the repository.
3. Build settings: **Framework preset** None · **Build command** empty · **Build output directory** `/`.
4. **Save and Deploy.** Pages finds the `functions` folder by itself (and ignores `worker.js` and `wrangler.jsonc`).
5. Check `https://<project>.pages.dev/` (the wall) and `https://<project>.pages.dev/api/jobs?diag=1` (the data).

**Updating the site you already have (`cooneenjobs.pages.dev`):** replace the repository's files with this folder's contents (`functions/api/jobs.js` is your working function; its Talos retrieval
is unchanged, and it has one small addition described under *Troubleshooting*), commit and push; Pages redeploys in about a minute. (A drag-and-drop upload in the
dashboard may not build the `functions` folder; use Git or `wrangler pages deploy`.)

**If `/api/jobs?diag=1` still says 404 on a Worker:** open a file that should be private, such as `/README.md`. If it *opens*, Cloudflare is uploading the folder as plain
files and is not reading `wrangler.jsonc` (a Worker made by drag-and-drop upload cannot run the function at all; use Git). Check, under the Worker's **Settings → Build**, that the
**Root directory** is the folder that contains `index.html`, `wrangler.jsonc` and `worker.js` (blank if they are at the repository root), that the deploy command is exactly
`npx wrangler deploy` (no `--assets` option), and that the files were uploaded **into** the repository root rather than inside a sub-folder. When it works, `/README.md` answers 404.

### After deploying (either option)

Screens that are already running the first version do not reload themselves, so restart or refresh each one once (for example from Yodeck). From then on every screen reloads itself nightly (03:30 London) and picks up future updates automatically.

Check these three things once:

1. Open `/?mode=kiosk` and `/?mode=hero` and look at them.
2. **Scan a QR code (hero mode) or click a vacancy in `/?mode=widget`** and confirm it opens the right vacancy page (see *What was and was not verified*).
3. Open `/?mode=kiosk&lang=fr` (and `de`, `nl`, `es`, `ro`) and ask a native speaker to skim the wording.

## The display modes

| Mode | Shows | Typical use |
|---|---|---|
| `wall` | a grid of vacancy cards that pages automatically | office screens, meeting areas |
| `kiosk` | the wall with signage behaviours: no buttons or links, hidden cursor, screen kept awake, clock, larger text | canteen, factory, corridors |
| `carousel` | one vacancy at a time, large, with the overview and optional QR; every vacancy in turn, 40 s each | portrait screens, quieter areas |
| `hero` | one vacancy at maximum size: title, facts, the overview and a QR code to the vacancy page; **every vacancy in turn, 40 s each** (`?job=` keeps one on screen) | reception, entrances |
| `duo` | **two vacancies side by side** (one above the other on a portrait screen), each with title, facts, overview and QR code; paired 1+2, 3+4, ... and every 40 s | 16:9 signage where hero is too sparse and the wall too busy |
| `widget` | compact list (default 5 rows) with counts of new / closing soon / featured; rows are links | SharePoint, Teams, intranet |
| `ticker` | continuous scrolling strip with the logo and INTERNAL VACANCIES label | the bottom of a screen layout |

Any mode takes `theme`, `lang`, `orientation`, `rotate`, `fontscale`, `qr`, the `show…` switches and the vacancy filters. Everything is
in [docs/URL-PARAMETERS.md](docs/URL-PARAMETERS.md) – or let the **Display builder** (`/admin`) write the address for you, with a live preview.

## Documentation

Everything in the brief, in this repository:

| Deliverable | Where |
|---|---|
| 1 Updated architecture · 2 Component design | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| 3 URL parameter system | [docs/URL-PARAMETERS.md](docs/URL-PARAMETERS.md) (the table is generated from the code) |
| 4 Translation system | [docs/TRANSLATIONS.md](docs/TRANSLATIONS.md) |
| 5 Theme system | [docs/THEMES.md](docs/THEMES.md) |
| 6 Layout engine · 7 Responsive strategy | [docs/LAYOUT.md](docs/LAYOUT.md) |
| 8 Signage strategy (and installing on Yodeck, SharePoint, Teams) | [docs/SIGNAGE.md](docs/SIGNAGE.md) |
| 9 QR implementation | [docs/QR.md](docs/QR.md) |
| Cooneen branding, logo file, colours | [docs/BRANDING.md](docs/BRANDING.md) and `assets/img/README.md` |
| 10 Production-ready code | this repository |

## Project layout

```
index.html                     the display (all modes)
admin.html                     Display builder (/admin)
functions/api/jobs.js          the /api/jobs function (Talos retrieval; logic unchanged): run by Pages, and by worker.js on Workers
worker.js                      Cloudflare Workers entry: /api/jobs -> the function, everything else -> the static files
wrangler.jsonc                 Workers settings (name, entry, static files); Pages ignores it
.assetsignore                  files kept out of the public website on Workers
assets/
  img/   README.md             where to put the Cooneen logo (logo.svg / logo.png)
  css/   themes.css            colour tokens for every theme (the only place colours live)
         app.css               layout and sizes, in scale-independent "design pixels"
         fonts.css             Nunito (Google Fonts; falls back to the system font)
         admin.css
  js/    config.js             every URL parameter in one SCHEMA: parsing, validation, defaults
         store.js              data layer: fetch, validate, saved copy, back-off, polling
         vacancies.js          selection, sorting, badges, hero order, duo pairing (pure functions)
         slideshow.js          the rotating screen engine shared by hero, duo and carousel
         main.js               start-up; builds the view that every mode draws
         modes/                wall.js carousel.js hero.js duo.js widget.js ticker.js
         components.js         cards, badges, feature slide, duo panel, heading band + logo, status, QR, text fitting
         layout.js             wall grid arithmetic          stage.js   screen size, rotation, scale
         i18n.js               six languages                 qr.js      QR encoder (no library)
         runtime.js            long-uptime housekeeping, keyboard, ?diag=1
         rotator.js dom.js early.js legacy.js admin.js
docs/                          the documents listed above
tests/                         unit.mjs  contrast.mjs
tools/params-doc.mjs           regenerates the parameter table in docs/URL-PARAMETERS.md
```

No build step, no framework, no external scripts. Plain ES modules served as they are.

## Tests

Needs Node 20.19+ or 22.7+ (it loads the browser modules directly). No packages to install.

```
node --no-warnings tests/unit.mjs          42 tests: parameters, translations, badges, layout engine, data validation, QR, reload timing,
                                           documentation in sync with the code
node --no-warnings tests/contrast.mjs      WCAG contrast of every colour pair in every theme (5 themes, 160 pairs)
node --no-warnings tools/params-doc.mjs    rewrite the parameter table after changing config.js (add --check to only verify)
```

The browser tests used while building this (layout sweep, accessibility, long-run soak, network loss, nightly reload, QR decoding) need Playwright
and are not part of the deliverable; their results are summarised under *What was and was not verified*.

## How the Talos page actually gets its vacancies

Found by inspecting a real browser capture (HAR) and saved page source of
`https://cooneensgroup1.talosats-careers.com/all-vacancies?...`:

| Question | Finding |
|---|---|
| Listings in the initial HTML? | **No.** The HTML is an empty Angular shell (header, footer, site settings). |
| JSON-LD `JobPosting`? | None found. |
| Data in script tags / page state? | Page state holds site settings only (site ID, page layouts, filter definitions) – no vacancies. |
| XHR/Fetch to an API? | **Yes.** One request: `POST https://api-careers-sites.talos360.com/api/careerssite/vacancies/search` |
| Request body | `{"careersSiteObfuscatedId":"e678b62a-eaf0-4925-9d8c-b812de7fa3a1","whereCriteria":null,"metadataFilters":[],"preFilters":[],"siteType":"Internal"}` |
| Auth / cookies / tokens? | None sent. Only `Content-Type: application/json` and the usual browser headers. |
| Response | `{"careersSiteVacancies":[ {...}, ... ]}` – the whole list in one response. |
| Pagination | **None observed.** The request has no page / offset / cursor field and the response has no paging data, so one call returns every vacancy. (The page made the same call twice back-to-back; both responses were identical.) |
| Does `custom=323-_324-` restrict results? | No. It is the Location (323) and Skill-or-Department (324) filters with nothing selected. The page sent `metadataFilters: []`. |
| CORS | The response carried `Access-Control-Allow-Origin: *`. |

Fields used: `jobPostId`, `jobReference`, `jobTitle`, `jobDescription` (HTML: the summary, the overview and the searchable text are made from it), `metadata`
("Location", "Skill or Department"), `employmentType`, `employment`, `remoteWork`,
`dateCreated`, `expiryDate`, `applyUrlBase` (if present). `applyUrlRoute` (the application form) is no longer used: links go to the vacancy page.

Salary fields exist but are deliberately **not** shown: in the captured data a £26,000–£35,000 role
was marked "per Hour", so displaying them would mislead.

There is **no "featured" flag** in Talos. "Featured" is therefore a display setting: `?featured=<reference or ID>,<…>`.

### Why a Pages Function and not just a web page

The API sends `Access-Control-Allow-Origin: *`, so a browser would probably be allowed to call it directly (the browser's pre-flight check
was not visible in the capture, so that is not confirmed). But a browser-only page cannot give a shared 08:00/12:00 cache (every screen would hit
Talos), cannot keep serving the last good list when Talos is down, and would rely on an undocumented internal API accepting calls from any
origin indefinitely. The function keeps Talos at a handful of requests a day, whatever the number of screens.

## How refreshing works (important)

This is **request-driven, not a scheduled job.** Europe/London time is split into slots starting at
**08:00** and **12:00**. The first request after a slot starts triggers one fetch from Talos; every
later request in that slot is served from cache. Before 08:00 the previous day's 12:00 data is
still current. Daylight-saving changes are handled by the `Europe/London` time zone, not a fixed
offset (tested across both 2026 changes).

- If nobody visits between 08:00 and 12:00, the 08:00 refresh simply happens on the next visit. Screens check every 10 minutes (`refresh=`), so in
  practice the first screen to check after 08:00 triggers it.
- The cache is **per Cloudflare data centre**, so a few data centres may each refresh once per slot
  – a handful of Talos requests a day, never one per screen or visitor.
- If a refresh fails, the previous data keeps being served (`X-Jobs-Cache: STALE`) and Talos is not
  retried for 60 seconds. Screens keep showing the list and add a small notice if the service stays unreachable.
- The display hides any vacancy whose closing time has passed, even between refreshes. Closing dates from Talos are the end of the day in London,
  so "closes today / tomorrow" and "Closing soon" are counted in London calendar days.
- Cloudflare's documentation says the Cache API does not work behind **Cloudflare Access**. If you protect this site with Access, the shared edge cache is
  skipped and only each server's short-term memory is used – it still works, but Talos is contacted more often.

`X-Jobs-Cache` values: `HIT` (served from cache), `MISS` (fetched from Talos just now),
`STALE` (refresh failed, older copy served), `ERROR` (refresh failed and no copy exists, HTTP 502/504).

## Diagnostics

- `/?diag=1` (any mode) shows a panel: the settings the screen understood and any it ignored, data health, last and next check, uptime, next reload,
  wake-lock state, errors, DOM size, and the server's diagnostics.
- `/api/jobs?diag=1` adds a `diagnostics` object to the JSON. It contains only counts, timings, cache state and error codes – no vacancy text,
  headers, cookies or upstream bodies. Useful fields: `currentSlot`, `nextRefreshAt`, `cache.servedFrom`, `cache.lastEdgeWrite`,
  `lastSuccessfulRefresh.recordsReceived / jobsPublished / recordsMalformed / duplicatesRemoved`,
  `lastSuccessfulRefresh.topLevelKeys` (should be exactly `["careersSiteVacancies"]`), `lastSuccessfulRefresh.linkHosts`, and `refreshError` when a refresh failed.
- The Display builder lists anything in an address that would be ignored or adjusted.

## Testing the API and confirming everything was retrieved

1. **Fetch it twice:** open `/api/jobs` (or `curl -i https://<project>.pages.dev/api/jobs`).
   First call after a slot change: `X-Jobs-Cache: MISS`. Second call: `HIT`.
2. **Count it:** `meta.count` is the number of vacancies on the board.
3. **Compare with Talos directly.** On the careers site page, open DevTools → Console and run:
   ```js
   fetch('https://api-careers-sites.talos360.com/api/careerssite/vacancies/search', {
     method: 'POST', headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({ careersSiteObfuscatedId: 'e678b62a-eaf0-4925-9d8c-b812de7fa3a1',
       whereCriteria: null, metadataFilters: [], preFilters: [], siteType: 'Internal' })
   }).then(r => r.json()).then(d => console.log(d.careersSiteVacancies.length));
   ```
   That number should equal `diagnostics.lastSuccessfulRefresh.recordsReceived` from `/api/jobs?diag=1`,
   and `jobsPublished` should equal it too (unless `recordsMalformed` or `duplicatesRemoved` is above 0).
4. **Check a link:** in `/?mode=widget`, click a vacancy and confirm it opens the right vacancy.

## Troubleshooting

**The screen shows "Vacancies can't be loaded right now".** The display could not reach `/api/jobs` and has no saved copy. It keeps retrying and fixes itself;
if it persists open `/api/jobs?diag=1` and read `error.code`:
- `404` on `/api/jobs` itself – on Pages, `functions/api/jobs.js` is not at the repository root; on a `.workers.dev` Worker, `worker.js` / `wrangler.jsonc` are missing or the deploy command is not `npx wrangler deploy`. Fix and redeploy.
- `upstream_status` – Talos answered with an error; `refreshError.upstream.upstreamStatus` shows the code.
  A 403 would mean Talos is refusing requests from Cloudflare; compare with step 3 above.
- `upstream_timeout` / `upstream_unreachable` – Talos is slow or down; the board recovers by itself.
- `upstream_not_json` – Talos returned a web page (maintenance or bot-protection page) instead of data.
- `upstream_schema` – the data format changed (see "Talos changes its page structure").
- `internal_error` – a bug; check the real-time logs (Pages → your project → **Functions**, or Workers → your Worker → **Logs**).
Errors never include Talos response bodies. If a cached copy exists you get HTTP 200 with `X-Jobs-Cache: STALE` instead.

**"No internal vacancies at the moment".** Either there really are none, or a `location=` / `department=` / `type=` filter in the address matches nothing.
Remove the filters, then compare counts (step 3 above). If `meta.count` is 0 but the careers site shows roles, a different count means the request needs
updating; the same count of 0 means there really are none. If the site ID or `siteType` changed, copy the new request body from DevTools → Network
(`vacancies/search`) into `CAREERS_SITE_ID` / `CAREERS_SITE_TYPE` at the top of `jobs.js`.

**A setting does nothing.** Add `&diag=1`: ignored or adjusted parameters are listed. Names are not case-sensitive, but values must be valid
(`?mode=disco` is ignored, `?columns=50` becomes 10).

**Text is too small / too large from where people stand.** Add `fontscale=1.3` (or `0.9`). Above 1.2 the wall automatically uses fewer, bigger cards.
`cardsize=large` is the other lever.

**The screen is sideways or upside down.** Add `rotate=90`, `180` or `270` (turns the display clockwise), or rotate the screen in Yodeck / the OS, not both.

**The Nunito font does not appear.** The screen's network blocks `fonts.gstatic.com`; the system font is used instead and everything still fits. To self-host
the font see `assets/css/fonts.css` (download the five `.woff2` files, point the `url(...)`s at them, remove `https://fonts.gstatic.com` from `font-src` in `index.html` and `admin.html`).

**`workers.dev` address.** Cloudflare's Cache API does nothing on `*.workers.dev` hostnames, so there the function uses only per-server memory and says so in the diagnostics
(`edgeCacheNote`). It works, but a `*.pages.dev` address or a custom domain is better for many screens. (This note is the only addition to `jobs.js` since the first zip; the retrieval logic is untouched.)

**Only the first page appears / vacancies missing.** This API does not paginate, so there should be no "pages". Compare counts (step 3). If Talos adds paging,
`topLevelKeys` in the diagnostics will list new keys. Send a fresh HAR that includes the second-page request and the function can be extended.

**Talos changes its page structure.** Signs: `STALE` with `staleReason: upstream_schema`, a rising `recordsMalformed`, or fields such as `withDepartment` dropping to 0 in diagnostics.
The mapping is in `normaliseRecord()`, `makeOverview()` and `buildVacancyUrl()` in `jobs.js` (field names `jobTitle`, `jobPostId`, `jobDescription`, `metadata` names "Location" / "Skill or Department"). If every record becomes unusable, the board keeps serving the last good copy instead of going blank.

**Cloudflare serves stale results.** Between 08:00 and 12:00 (and 12:00 to 08:00) "the same data" is correct. If `X-Jobs-Cache` is `STALE`, a refresh is failing – see
`refreshError` in the diagnostics. To force a fresh fetch, change `CACHE_KEY_PATH` in `jobs.js` (e.g. `/__cache/jobs-v3`) and redeploy. Different data centres refresh
independently, so two screens can briefly show different lists.

## Security notes

- The upstream URL, request body and allowed link host are constants in `jobs.js`; nothing in the request to `/api/jobs` can change where it connects, and `/api/jobs` is not an open proxy.
- Vacancy text is reduced to plain text on the server and written to the page as text (the code never uses `innerHTML`; `tests/unit.mjs` scans the source for it, for `eval` and for inline scripts and styles). Every page has a
  Content-Security-Policy that allows scripts and styles only from the site itself, fonts from `fonts.gstatic.com` and data only from the site.
- Links, and the addresses inside QR codes, are used only if they are `https://` on `cooneensgroup1.talosats-careers.com`, checked on the server and again in the browser.
  Links open with `rel="noopener noreferrer"`. Signage modes contain no links unless you add `links=1`.
- Settings in the address are validated; text settings are length-limited, cleaned of control characters and only ever shown as text.
- No analytics, trackers or third-party scripts. The browser keeps a copy of the last list (job data only, no personal data) in local storage as an offline fallback.
- `/api/jobs` sends no CORS headers, so other websites cannot read it from a browser. The pages can be embedded in frames (SharePoint, Teams); add a `_headers` file only if you
  want to restrict that.
- Vacancies are **internal**, but the site itself is not password-protected: anyone who knows the address can open the display and `/api/jobs`. If that is not acceptable, put the
  site behind access control (for example Cloudflare Access), bearing in mind that unattended signage players usually cannot sign in, so plan how they will authenticate.

## What was and was not verified

**Verified** (automated, in a real Chromium browser unless stated):

- Talos retrieval and `jobs.js`: field mapping, link construction, HTML stripping, de-duplication, slot logic across both daylight-saving changes, cache hit / miss / stale / error behaviour with simulated failures (against the real captured API response).
- 42 unit tests and 9 Worker tests (`node --no-warnings tests/worker.mjs`: `/api/jobs` goes to the function, every other path to the static files, other methods refused, `workers.dev` and custom-domain caching, the role overview extraction and the vacancy-page links); contrast of every colour pair in every theme (160 pairs, all above target).
- Layout: 104 mode × screen-size × data-size combinations, 52 option variants, 150 theme × language combinations and 44 rotation combinations (350 in all) – no console errors, nothing off-screen, no text running into a card's border, titles fit. A few deliberately extreme settings (for example five columns on a portrait screen) are allowed to produce small text, as the address asked for it.
- Version 2.1 layouts (hero, duo, carousel, wall with the new heading band and logo): a further 155-combination sweep (six screen sizes including portrait and 4K, five sets of vacancies including very long titles and overviews and none, every theme, five languages, `fontscale` 1.5, `rotate=90`) – no console errors, nothing off-screen, no clipped or overflowing text, with one known exception: a custom `?title=` of about 70 characters is shrunk to 35 % and then cut with "…" (keep a custom heading short: about 25 characters is as long as it stays large). Screenshots were reviewed by eye for every mode in landscape and portrait.
- Rotation: the hero cycles through every vacancy (and the duo through every pair) with the 40-second default; `limit=1` and a pinned `job=` stay still.
- QR codes: 22 of 22 rendered codes decode to exactly the vacancy link with an independent decoder (OpenCV), and the version 2.1 hero code decodes to the `/job/<id>` page address; see [docs/QR.md](docs/QR.md) for the detail.
- States (loading, failed, empty, saved copy, bad data), keyboard operation, screen-reader structure, reduced motion, link safety.
- Long uptime with a fake clock: 6 hours (wall with QR; and, for version 2.1, hero, duo and carousel – DOM nodes and event listeners constant, JS heap 1.1 → 1.5 MB over the six hours, which the nightly reload resets) and 3 hours (ticker, widget) – memory, DOM and listeners flat; about one request per 10 minutes; network loss and
  recovery; nightly reload (timing, skipped when the site is unreachable); error watchdog (one reload, no loop).

**Not verified – please check after deploying:**

- **Vacancy links / QR targets - please scan one.** Every QR code and widget link is `https://cooneensgroup1.talosats-careers.com/job/<jobPostId>`. That pattern was worked out
  from outside (Talos careers sites use `/job/<id>` for a vacancy page, and `/job/942545` on Cooneen's site answered with the "Graphic Designer" page), but the page is drawn
  by Angular in the browser, so it could not be opened and seen here. **Scan one QR code and check it opens the vacancy and shows the Apply button.** If it does not, the address is
  `VACANCY_PATH` at the top of `jobs.js` (one line), or send me the address of one real vacancy page.
- **The Cooneen logo file.** The logo could not be downloaded in the build environment, so no logo file is included. The display loads it from cooneengroup.com
  (`cooneen_group_rgb_reverse_grad.png`, the white artwork the website uses on its dark header) and puts it on a dark plate, and falls back to the words "Cooneen Group" if that fails.
  Screens were tested with a stand-in logo. Add the real file as `assets/img/logo.svg` or `.png` - see `assets/img/README.md` - and look at it on a real screen.
- **The website's typeface** could not be identified (the site could not be read in full here); the display uses Nunito, the staff portal's typeface. Colours are the portal's and the website's orange, charcoal and blue.
- A live call from Cloudflare's network to the Talos API (the build environment could not reach it) – run the checks above after deploying.
- **The Workers deployment itself.** `wrangler` could not be installed in the build environment, so `wrangler.jsonc` was not run through Cloudflare's own tool. The Worker, the asset rules
  and the display were exercised with a local stand-in (the real `worker.js` and `.assetsignore`, the real Talos response), and every page and mode loaded. If the Cloudflare build
  fails, its log names the line; the usual cause is the `name` in `wrangler.jsonc` not matching the Worker's name.
- **The Nunito web font** (the build environment cannot reach Google's font host, so tests used a system font; the display re-fits when the font arrives, but look at a real screen).
- **Translations** (French, German, Dutch, Spanish, Romanian) are checked for completeness and placeholders only, not by native speakers.
- **Real phones scanning real screens**, real signage hardware over weeks, and Yodeck, SharePoint and Teams themselves.
- A full automated accessibility audit with axe (its package could not be downloaded here); keyboard, focus, screen-reader structure and contrast were tested individually instead.
- Browsers older than Chromium 84 show a plain "needs a newer browser" message.

## Settings you may want to change (top of `jobs.js`)

| Constant | Meaning |
|---|---|
| `REFRESH_HOURS` | London hours that start a new slot (`[8, 12]`) |
| `FAILURE_COOLDOWN_MS` | Pause before retrying Talos after a failure (60 s) |
| `UPSTREAM_TIMEOUT_MS` / `MAX_ATTEMPTS` | Talos request timeout (10 s) / tries (2) |
| `SUMMARY_MAX` / `OVERVIEW_MAX` / `DESCRIPTION_MAX` | Summary length (240) / overview length (900) / searchable text per vacancy (3000) |
| `VACANCY_PATH` | Where a vacancy's own page lives on the careers site (`/job/`); what the QR codes open |
| `ALLOWED_LINK_HOSTS`, `CAREERS_ORIGIN` | Link allow-list (also `CAREERS_HOST` in `assets/js/store.js`) |
