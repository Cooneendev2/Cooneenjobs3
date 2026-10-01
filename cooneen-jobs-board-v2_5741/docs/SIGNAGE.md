# Signage strategy

How the display behaves on screens that run for weeks without anyone touching them, and how to put it on Yodeck, SharePoint, Teams
and the intranet.

## Kiosk behaviour

`?mode=kiosk` (the wall) or `?kiosk=1` added to any mode:

- no on-screen buttons, no links (unless you add `links=1`), **mouse pointer hidden**
- larger text by default (`fontscale` 1.1) and a clock in the heading band (the orange **INTERNAL VACANCIES** band is the same in every mode)
- the **screen is kept awake** (Screen Wake Lock, where the browser supports it)
- the footer is a thin paging bar; a status message appears only when something is wrong, floating over the bar so nothing moves
- keyboard still works for whoever is at the PC: ← / → or PgUp / PgDn change page, Space or P pauses, F toggles full screen

Rotation is time-based (`rotation=` seconds). **Hero, duo and carousel show each vacancy (or pair) for 40 seconds by default**, long enough to
read the role overview; the wall and ticker keep their own faster defaults.

## Built for weeks of uptime

| Risk | What the display does |
|---|---|
| Memory growth | One timer at a time; every page build replaces the old DOM; no growing lists; QR codes are cached (max 200) and the cache is cleared when full. **Nightly reload** (default 03:30 London, +0–15 min so screens do not all reload at once) releases everything and picks up any new version of the display. The reload only happens if the site answers a `HEAD` request first; otherwise it tries again 10 minutes later, so a screen is never reloaded into a browser error page. `reload=off` disables it. |
| Stale data | Checks `/api/jobs` every 10 minutes (±10 %), and again shortly after the server's next 08:00 / 12:00 refresh. The shared cache means this is cheap: the server contacts Talos only about twice a day per data centre. |
| Network or service outage | Keeps showing the last list. After 15 minutes of failed checks it adds a small "can't reach the service, showing the list from 09:12" note. Retries with back-off (30 s, 1 min, 2 min … up to the refresh interval) and **recovers within seconds** of the network returning (`online` event). |
| Start-up with no network | Shows the copy saved in the browser, with a note, until the service answers. Only if there is no saved copy does it show a "can't be loaded right now, will keep trying" panel. |
| Bad data from the server | Rejected by validation; the screen keeps what it has. |
| Data older than 26 h | Shows "this list may be out of date (last updated …)". |
| A bug or browser fault | An error watchdog counts page errors; 5 in 10 minutes triggers one reload (only if the site answers, at most once every 30 minutes, so it cannot loop). |
| Hidden or sleeping screen | When the page is hidden, rotation and animation pause and resume with the time that was left; on return it checks the data immediately if one is due. |
| Heavy animation | Very little moves: the page cross-fade, the paging progress bar, the ticker, and a gentle pulse on the "loading" panel. With "reduce motion" on (or `motion=reduced`) the fades and the bar fill are removed and the ticker shows one vacancy at a time. |
| Power cycles | Nothing is stored on the server and the address *is* the configuration, so a restarted screen comes back exactly as before. |

`?diag=1` adds a panel with the settings the screen understood (and anything it ignored), the data health, last and next check,
uptime, next reload time, wake-lock state, recent errors, DOM size and, in Chrome, memory use. `/api/jobs?diag=1` shows the server
side. Neither contains vacancy text.

## Installing on a screen

### Yodeck

1. Build the address in the **Display builder** (`https://<your-site>/admin`) and copy it.
2. In Yodeck add a **Web page** widget (website) and paste the address. For a full-screen vacancy display use `?mode=kiosk`, `?mode=hero` or
   `?mode=duo` or `?mode=carousel&kiosk=1`. For a strip along the bottom of a layout, give the zone its own region and use `?mode=ticker`
   (for example a 1920 × 120 region).
3. Do not rotate the screen in Yodeck **and** add `rotate=`: use one or the other.
4. If a player shows "This screen needs a newer browser", its built-in browser is older than Chromium 84 – update the player software.

### Windows / Linux / Raspberry Pi kiosk PC

Start Chrome or Edge in kiosk mode on the address, for example
`chrome --kiosk --noerrdialogs --disable-infobars "https://<your-site>/?mode=kiosk"`. Set the PC not to sleep.

### SharePoint, intranet pages, Teams

Use `?mode=widget&theme=light` (or `portal` beside the staff portal). The widget is an ordinary page: clickable rows, keyboard and
screen-reader accessible, "All vacancies" link to the careers site.

- **SharePoint Online:** add an **Embed** web part with the address. SharePoint only embeds sites on its allow-list; a site admin may need to add your
  `*.pages.dev` (or custom) domain under *Site settings → HTML field security*.
- **Teams:** add a **Website** tab with the address.
- **Intranet:** an `<iframe src="https://<your-site>/?mode=widget&theme=light" title="Internal vacancies" width="420" height="560">`.
- The site sends no `X-Frame-Options` or `frame-ancestors` restriction, so embedding works. If you later add a `_headers` file that
  restricts framing, embedding stops working.
- The widget scales to whatever size the frame gives it (it was exercised from 300 × 400 to 800 × 300). `rows=` sets how many
  vacancies it lists.

> SharePoint, Teams and Yodeck could not be tested from the build environment. The pages are standard HTML served over HTTPS and
> were tested in Chromium at the sizes those products use; do one real check in each product after deploying.

## Content strategy for awareness

- **Order**: Featured, then Closing soon, then New, then newest first, so what matters most is on the first page.
- **Badges** tell people at a glance why a vacancy matters (New, Featured, Closing soon), with an icon *and* a word.
- **Different screens, different content**: use `location=`, `department=` or `type=` so each site's screen leads with local
  vacancies, and `featured=` to push a vacancy the business needs filled now.
- **Reception / lobby**: `mode=hero` shows one vacancy at a time, very large, with the role overview and a QR code, and rotates through
  **every** vacancy, 40 seconds each (Featured first, then Closing soon, New and newest). It stays on one vacancy only when there is
  exactly one, or when you pin one with `job=<reference>`.
- **Factory floor, canteen, corridors**: `mode=duo` shows two vacancies side by side (1 + 2, then 3 + 4, then 5 + 6 …), each with its title,
  role overview and QR code, on the same 40-second rotation. Every vacancy appears; with an odd number the last screen pairs the final
  vacancy with the first. It suits a 16:9 screen where the hero feels sparse and the wall feels crowded.
- **Every screen starts the same way**: the orange band with the Cooneen logo and **INTERNAL VACANCIES**, in the same place and size in every
  mode and in portrait and landscape, so the first thing a passer-by reads is that these are *internal* opportunities.
- **The QR code opens the full vacancy page** (responsibilities, requirements and the Apply button), not the application form.
- **Staff areas with phones in hand**: `qr=1` on the wall or carousel puts a QR on each vacancy.
- **Offices and the intranet**: the widget or the ticker.

## What was verified (and what was not)

Verified in a real browser (Chromium, with the network faked to simulate failures and a fake clock to simulate hours):

- 6 simulated hours of paging and refreshing on the wall with QR on (JS heap 2.3 → 2.5 MB, DOM nodes and listeners unchanged, 36 requests to
  `/api/jobs` in the 6 hours), and 3 hours each on the carousel, hero, ticker and widget: memory, DOM and listeners stay flat
- network loss: the list stays on screen, the warning appears after the threshold, and the screen recovers as soon as the network returns
- the nightly reload happens at about 03:30 London time (after a successful site check), not before, and is skipped (retried later)
  when the site is unreachable; the error watchdog reloads once, not in a loop
- rotation advances on time, holds while the page is hidden and resumes
- reduced-motion behaviour; keyboard operation; screen-reader structure; every link is `https` on the careers host

Added in version 2.1 (checked in a real browser at 1080p, 720p, 4K and portrait, in every theme and five languages; see
[LAYOUT.md](LAYOUT.md)): the heading band and logo on every mode, the duo mode, the 40-second hero rotation through every vacancy, and QR
codes to the vacancy page. The hero and duo rotation was also run on a fake clock for several simulated hours with flat memory.

Not verified here: weeks of real-world uptime on real signage hardware, Yodeck, SharePoint and Teams themselves, the actual Cooneen logo
file (a text wordmark stands in until the file is added; see [BRANDING.md](BRANDING.md)), that the `/job/<id>` page pattern opens the right
vacancy on Talos (scan one code after deploying), and the Nunito web font
(the build environment cannot reach Google's font host, so tests used the system font; Nunito is slightly wider, and the display
re-fits its text when the font arrives). See the README for the full list.
