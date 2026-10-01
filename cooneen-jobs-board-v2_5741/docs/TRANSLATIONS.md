# Translation system

`?lang=en | fr | de | nl | es | ro` (default `en`).

## What is translated – and what is not

| Translated (interface) | Not translated |
|---|---|
| Heading, badges (New / Featured / Closing soon), "Closes tomorrow", "Posted 3 days ago", "Scan to view the vacancy", paging and button labels, loading / error / empty messages, status line, screen-reader labels, dates and times | **Vacancy content**: titles, locations, departments, employment types, summaries and the role overview stay exactly as they are in Talos |

Dates and times are formatted for the language (`Intl.DateTimeFormat`, always in London time). `<html lang>` and the browser tab title
follow the chosen language, so screen readers pronounce the interface text correctly. Vacancy text is shown as it comes, so a screen reader
may read English vacancy titles with a French voice; that is a limit of mixing languages on one page, not something the display can fix.

## How it works

All interface text lives in one place: `DICT` in `assets/js/i18n.js`, one block per language. **The display code contains no interface
wording**; components call `ctx.i18n.t('key', { vars })`. The only English text outside `DICT` is what a screen shows when the display
cannot start at all (the start-up fallback in `index.html` / `main.js` / `legacy.js`, which cannot rely on the translation code) and the
`?diag=1` support panel.

```js
t('closesInDays', { n: 3 })   // en: "Closes in 3 days"   fr: "Clôture dans 3 jours"   ro: "Se închide în 3 zile"
```

- A value is either a string or an object of **plural forms** (`{ one, few, many, other }`). The form is chosen with
  `Intl.PluralRules` for that language, so Romanian ("1 nou", "3 noi", "20 de noi") and every other language pluralise correctly
  instead of just adding an "s".
- `{placeholders}` are filled from the variables passed to `t()`.
- A missing key falls back to English, and a missing English key shows the key name (so a mistake is visible, never blank).
- `createI18n(lang)` also provides `date(ms)`, `time(ms)` and `dateTime(ms)`.

## Adding or changing a language

1. In `i18n.js`, copy the `en` block, rename it (for example `it`) and translate every value. Keep the `{placeholders}` exactly.
   Give each plural form the language needs (check what `new Intl.PluralRules('it').resolvedOptions().pluralCategories` says).
2. Add it to `DICT` and to `LOCALES` (the full locale, such as `it-IT`) in `i18n.js`.
3. Add its code to `LANGS` in `config.js`. The Display builder and the parameter reference pick it up automatically.
4. Run `node --no-warnings tests/unit.mjs`. `validateDictionary()` fails if any language is missing a key, has an extra key, or
   uses different placeholders from English.

To change a wording, edit the value in `DICT`. Nothing else needs to change.

## Review status

English is the source text. The French, German, Dutch, Spanish and Romanian texts are careful translations of short interface phrases,
checked by the automated key/placeholder test, **but they have not been reviewed by native speakers.** Have a colleague skim each
language on a real screen (`/?mode=kiosk&lang=de` …) before going live (the heading `INTERNAL VACANCIES` and the QR caption
"Scan to view the vacancy" are the two phrases everyone will see first); fixing a word is a one-line edit.
