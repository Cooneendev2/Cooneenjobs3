# Theme system

`?theme=cooneen | dark | light | highcontrast | portal` (default `cooneen`).

| Theme | Look | Use it for |
|---|---|---|
| `cooneen` | Charcoal (#1A1A1A) screen, **Cooneen orange (#E87722) heading band**, white cards and panels, orange accents | Most signage screens |
| `dark` | Near-black screen, black heading band with orange lettering, dark cards | Dim rooms, OLED screens |
| `light` | Warm paper background, white cards, the same orange heading band | SharePoint / Teams / intranet widgets, bright offices |
| `highcontrast` | Pure black and white, signal-yellow heading band, thick 3 px card outlines | Accessibility; bright or distant screens |
| `portal` | Orange / blue / charcoal on light grey, matching the apps.cooneen.com staff portal; blue logo plate | Intranet pages that sit beside the portal |

The palette (orange #E87722, charcoal #1A1A1A, Cooneen blue #14456E, red #DC2626 for urgency) comes from the Cooneen Group website and the staff
portal. The heading band is the Cooneen colour in every theme, so the screens read as Cooneen at a glance (see [BRANDING.md](BRANDING.md)).

## How themes work

A theme is **one block of colour tokens** in `assets/css/themes.css`, selected by `<html data-theme="…">`. `early.js` sets the
attribute before the first paint so there is no flash of the wrong colours; `main.js` confirms it after validating the address.

**`app.css` contains no theme colours.** Every colour a person sees is `var(--token)`, so a theme can change anything on screen
and a new theme cannot miss a hard-coded colour. The only literal colours in the code are the QR code's black on white, which must
never change (see [QR.md](QR.md)), a neutral hover tint on widget rows, and the `?diag=1` support panel.

### Tokens

| Token | Used for |
|---|---|
| `bg-1`, `bg-2` | Screen background (a gentle top-to-bottom gradient); `twill` is a faint cloth texture |
| `on-bg`, `on-bg-2` | Text on the background; muted text |
| `rule` | Dashed "stitch" lines on the background |
| `surface`, `ink`, `ink-2` | Card background, card text, muted card text |
| `line`, `stitch` | Dashed divider inside a card, inner stitching |
| `accent`, `accent-ink`, `on-accent` | Accent fill / accent text on a card / text on an accent fill |
| `gold`, `on-gold` | **Featured** badge |
| `warn`, `on-warn`, `warn-ink`, `warn-text` | **Closing soon**: badge fill, text on the badge, text on a card, text on the background |
| `new`, `on-new` | **New** badge |
| `panel` | The duo screen's two panels (text on them uses `on-bg` / `on-bg-2`) |
| `hdr-bg`, `hdr-ink`, `hdr-edge` | The heading band (logo + INTERNAL VACANCIES): fill, text, bottom line |
| `plate-dark`, `plate-dark-ink`, `plate-light`, `plate-light-ink` | The plate the logo sits on (`?logobg=dark|light`) and the wordmark colour on it |
| `qr-edge` | The frame round every QR code (the code itself is always black on white) |
| `seg-bg` | Empty paging segments |
| `focus`, `focus-s` | Keyboard focus ring on the background / on a white card or list row |
| `shadow`, `card-border-w` | Card shadow; extra outline width (high contrast only) |
| `ticker-bg`, `ticker-ink`, `ticker-label-bg`, `ticker-label-ink`, `ticker-line`, `ticker-warn` | Ticker strip |

### Colour is never the only signal

The three badges are distinguished by an **icon and a word**, not by colour alone (New = lightning bolt, Featured = star,
Closing soon = clock), and "Closes today / tomorrow" is written out. In the widget's compact rows the icon alone is shown, with the word
available to screen readers, a tooltip and a legend line, so the meaning does not depend on telling orange from teal.

## Adding a theme

1. Copy one block in `themes.css`, change the `data-theme` name and the colours. Keep **every** token.
2. Add the name to `THEMES` in `config.js` (and to the list in `early.js`, which sets the colours before the page is drawn).
3. Run `node --no-warnings tests/contrast.mjs`. It reads `themes.css` directly, so the new theme is checked automatically.
4. Look at it on a wall, a hero and a widget (`/admin` shows them all).

## Contrast check

`tests/contrast.mjs` calculates the WCAG 2.x contrast ratio of every foreground/background pair in every theme:

- text on the background, card text, badge text, ticker text, warning text → at least **4.5 : 1**
- icons, focus rings and the paging progress → at least **3 : 1**

Current result: **5 themes, 160 colour pairs, 0 below target** (including the heading band, the logo plates, the duo panels and the QR frame). The check caught real problems while the themes were built (a focus ring that
disappeared on white cards, an orange that was too pale to read as text on light backgrounds), which is why there are separate
`focus-s`, `warn-ink` and `ticker-warn` tokens. The test measures colours, not the final pixels: a very bright room or a screen
with its own picture settings can still wash a display out, which is what the `highcontrast` theme and `fontscale` are for.
