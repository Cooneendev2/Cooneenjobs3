# Cooneen branding on the screens

The screens should look like a Cooneen internal communication, not a careers website. Every signage mode (wall, kiosk, carousel, hero,
duo) opens with the same **heading band**, and the widget and ticker carry the same branding in their own form.

```
+--------------------------------------------------------------------------------------------+
| [ COONEEN GROUP logo ]   INTERNAL VACANCIES                              5 open vacancies  |   <- orange band
+--------------------------------------------------------------------------------------------+
|  the vacancies ...                                                                         |   <- charcoal screen
```

Reading order from a few metres away: **1** the Cooneen logo, **2** INTERNAL VACANCIES, **3** the job title, **4** the role overview,
**5** the QR code.

## The heading band

- **Placement and styling are identical in every mode**, landscape and portrait (portrait puts the logo and the count on the first line
  and INTERNAL VACANCIES across the full width underneath). Orange (#E87722) with charcoal lettering, about 76 design pixels high
  (a design pixel is 1/1080 of the screen's short side), so on a 1080-pixel-high screen the words are about 7% of the screen height.
- The wording is `title` in `assets/js/i18n.js` (in capitals on screen): INTERNAL VACANCIES, INTERNE STELLENANGEBOTE, ... A long wording
  in another language shrinks to stay on one line instead of wrapping.
- The count ("5 open vacancies") and, in kiosk mode, the clock sit at the right end of the band.
- `?header=0` hides the band in the modes that allow it. Leave it on: it is the most important message on the screen.

## The logo

See `assets/img/README.md` for where the logo file goes. The logo sits on a plate (`?logobg=dark|light|none`) so it reads on the orange
band. If no logo can be loaded the words "Cooneen Group" are shown in its place; the screen never shows a broken image.

## Colours

Taken from the Cooneen Group website and the apps.cooneen.com staff portal.

| Colour | Hex | Used for |
|---|---|---|
| Cooneen orange | `#E87722` | the heading band, QR frames, the tick above every vacancy, Featured badge, ticker label |
| Charcoal | `#1A1A1A` | the default screen background, lettering on orange, the logo plate |
| Cooneen blue | `#14456E` | New (light blue on dark screens), the `portal` theme's plate and Featured badge |
| Urgency red | `#DC2626` | Closing soon only |
| White and warm greys | `#FFFFFF`, `#D9D4CD` | text and cards |

The default theme is `cooneen` (charcoal screen, orange band). `light` and `portal` keep the orange band on a light screen, `dark` uses
a black band with orange lettering, and `highcontrast` uses signal yellow. All colours are tokens in `assets/css/themes.css`; see
[THEMES.md](THEMES.md). Every text colour pair is checked for contrast (`node --no-warnings tests/contrast.mjs`), including the lettering on
the band.

## Typography

**Nunito**, the typeface of the Cooneen staff portal, in heavy weights for titles and the band, loaded from Google Fonts with a system-font
fallback (see the note at the top of `assets/css/fonts.css` to host it yourself). The website's own typeface could not be identified
from the build environment, so this was matched to the portal rather than the website: if the brand pack names a different typeface,
change `--font` at the top of `assets/css/app.css` and the files in `fonts.css`.

## What is not branded

The QR code itself is always black on white (anything else scans badly); only its frame is orange. The vacancy text is shown exactly as
it is in Talos.
