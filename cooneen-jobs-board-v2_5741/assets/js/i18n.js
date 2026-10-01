/* Translation system.
   Every piece of interface text comes from DICT – nothing is hard-coded in the display code.
   Vacancy content (titles, locations, summaries) is never translated.

   A value is either a string or an object of plural forms ({ one, few, other }) chosen with
   Intl.PluralRules for that language. {placeholders} are filled from the variables passed to t().
   To add a language: copy the `en` block, translate it, add it to LANGS in config.js and to LOCALES here. */

import { TZ } from './vacancies.js';

const en = {
  brand: 'Cooneen Group',
  title: 'Internal vacancies',
  tagline: 'Opportunities for Cooneen colleagues',
  count: { one: '{n} open vacancy', other: '{n} open vacancies' },
  badgeNew: 'New',
  badgeFeatured: 'Featured',
  badgeClosing: 'Closing soon',
  closesToday: 'Closes today',
  closesTomorrow: 'Closes tomorrow',
  closesInDays: { other: 'Closes in {n} days' },
  closesOn: 'Closes {date}',
  postedToday: 'Posted today',
  postedYesterday: 'Posted yesterday',
  postedDaysAgo: { other: 'Posted {n} days ago' },
  postedOn: 'Posted {date}',
  scanToView: 'Scan to view the vacancy',
  scanHint: 'Use your phone camera',
  allVacancies: 'See all vacancies',
  labelLocation: 'Location',
  labelDepartment: 'Department',
  labelType: 'Employment type',
  remote: 'Remote working',
  ref: 'Ref {ref}',
  loadingTitle: 'Loading vacancies…',
  errorTitle: "Vacancies can't be loaded right now",
  errorBody: 'This screen keeps trying and will show the list as soon as it is available.',
  emptyTitle: 'No internal vacancies at the moment',
  emptyBody: 'New roles are advertised here first. Please check back soon.',
  statusUpdated: 'Updated {time}',
  statusOffline: "Can't reach the vacancy service. Showing the list from {time}.",
  statusOld: 'This list may be out of date (last updated {date}).',
  pageOf: 'Page {page} of {pages}',
  slideOf: '{n} of {total}',
  pause: 'Pause',
  play: 'Resume',
  prev: 'Previous',
  next: 'Next',
  fullscreen: 'Full screen',
  allListLabel: 'All current internal vacancies',
  more: '+{n} more',
  newCount: '{n} new',
  closingCount: '{n} closing soon',
  tickerLabel: 'Latest internal vacancies'
};

const fr = {
  brand: 'Cooneen Group',
  title: 'Postes ouverts en interne',
  tagline: 'Des opportunités pour les collaborateurs de Cooneen',
  count: { one: '{n} poste ouvert', other: '{n} postes ouverts' },
  badgeNew: 'Nouveau',
  badgeFeatured: 'À la une',
  badgeClosing: 'Clôture proche',
  closesToday: "Clôture aujourd'hui",
  closesTomorrow: 'Clôture demain',
  closesInDays: { other: 'Clôture dans {n} jours' },
  closesOn: 'Clôture le {date}',
  postedToday: "Publié aujourd'hui",
  postedYesterday: 'Publié hier',
  postedDaysAgo: { other: 'Publié il y a {n} jours' },
  postedOn: 'Publié le {date}',
  scanToView: 'Scannez pour voir le poste',
  scanHint: "Avec l'appareil photo de votre téléphone",
  allVacancies: 'Voir tous les postes',
  labelLocation: 'Lieu',
  labelDepartment: 'Service',
  labelType: 'Type de contrat',
  remote: 'Télétravail',
  ref: 'Réf. {ref}',
  loadingTitle: 'Chargement des postes…',
  errorTitle: 'Impossible de charger les postes pour le moment',
  errorBody: "Cet écran réessaie automatiquement et affichera la liste dès qu'elle sera disponible.",
  emptyTitle: 'Aucun poste interne ouvert pour le moment',
  emptyBody: "Les nouveaux postes sont d'abord annoncés ici. Revenez bientôt.",
  statusUpdated: 'Mis à jour à {time}',
  statusOffline: 'Service injoignable. Affichage de la liste de {time}.',
  statusOld: 'Cette liste est peut-être périmée (dernière mise à jour : {date}).',
  pageOf: 'Page {page} sur {pages}',
  slideOf: '{n} sur {total}',
  pause: 'Pause',
  play: 'Reprendre',
  prev: 'Précédent',
  next: 'Suivant',
  fullscreen: 'Plein écran',
  allListLabel: 'Tous les postes internes en cours',
  more: '+{n} autres',
  newCount: { one: '{n} nouveau', other: '{n} nouveaux' },
  closingCount: { one: '{n} clôture proche', other: '{n} clôtures proches' },
  tickerLabel: 'Derniers postes internes'
};

const de = {
  brand: 'Cooneen Group',
  title: 'Interne Stellenangebote',
  tagline: 'Chancen für Cooneen-Kolleginnen und -Kollegen',
  count: { one: '{n} offene Stelle', other: '{n} offene Stellen' },
  badgeNew: 'Neu',
  badgeFeatured: 'Im Fokus',
  badgeClosing: 'Endet bald',
  closesToday: 'Endet heute',
  closesTomorrow: 'Endet morgen',
  closesInDays: { other: 'Endet in {n} Tagen' },
  closesOn: 'Endet am {date}',
  postedToday: 'Heute veröffentlicht',
  postedYesterday: 'Gestern veröffentlicht',
  postedDaysAgo: { other: 'Vor {n} Tagen veröffentlicht' },
  postedOn: 'Veröffentlicht am {date}',
  scanToView: 'Scannen und Stelle ansehen',
  scanHint: 'Mit der Handykamera',
  allVacancies: 'Alle Stellen ansehen',
  labelLocation: 'Standort',
  labelDepartment: 'Abteilung',
  labelType: 'Beschäftigungsart',
  remote: 'Remote-Arbeit',
  ref: 'Ref. {ref}',
  loadingTitle: 'Stellenangebote werden geladen …',
  errorTitle: 'Stellenangebote können gerade nicht geladen werden',
  errorBody: 'Dieser Bildschirm versucht es automatisch erneut und zeigt die Liste, sobald sie verfügbar ist.',
  emptyTitle: 'Derzeit keine internen Stellenangebote',
  emptyBody: 'Neue Stellen werden zuerst hier ausgeschrieben. Schauen Sie bald wieder vorbei.',
  statusUpdated: 'Aktualisiert um {time}',
  statusOffline: 'Dienst nicht erreichbar. Angezeigt wird die Liste von {time}.',
  statusOld: 'Diese Liste ist möglicherweise veraltet (zuletzt aktualisiert: {date}).',
  pageOf: 'Seite {page} von {pages}',
  slideOf: '{n} von {total}',
  pause: 'Pause',
  play: 'Fortsetzen',
  prev: 'Zurück',
  next: 'Weiter',
  fullscreen: 'Vollbild',
  allListLabel: 'Alle aktuellen internen Stellenangebote',
  more: '+{n} weitere',
  newCount: '{n} neu',
  closingCount: '{n} enden bald',
  tickerLabel: 'Neueste interne Stellenangebote'
};

const nl = {
  brand: 'Cooneen Group',
  title: 'Interne vacatures',
  tagline: "Kansen voor Cooneen-collega's",
  count: { one: '{n} openstaande vacature', other: '{n} openstaande vacatures' },
  badgeNew: 'Nieuw',
  badgeFeatured: 'Uitgelicht',
  badgeClosing: 'Sluit binnenkort',
  closesToday: 'Sluit vandaag',
  closesTomorrow: 'Sluit morgen',
  closesInDays: { other: 'Sluit over {n} dagen' },
  closesOn: 'Sluit op {date}',
  postedToday: 'Vandaag geplaatst',
  postedYesterday: 'Gisteren geplaatst',
  postedDaysAgo: { other: '{n} dagen geleden geplaatst' },
  postedOn: 'Geplaatst op {date}',
  scanToView: 'Scan om de vacature te bekijken',
  scanHint: 'Gebruik de camera van je telefoon',
  allVacancies: 'Alle vacatures bekijken',
  labelLocation: 'Locatie',
  labelDepartment: 'Afdeling',
  labelType: 'Soort dienstverband',
  remote: 'Thuiswerken',
  ref: 'Ref. {ref}',
  loadingTitle: 'Vacatures laden…',
  errorTitle: 'Vacatures kunnen nu niet worden geladen',
  errorBody: 'Dit scherm probeert het automatisch opnieuw en toont de lijst zodra die beschikbaar is.',
  emptyTitle: 'Op dit moment geen interne vacatures',
  emptyBody: 'Nieuwe functies worden eerst hier gepubliceerd. Kom binnenkort terug.',
  statusUpdated: 'Bijgewerkt om {time}',
  statusOffline: 'Service niet bereikbaar. Lijst van {time} wordt getoond.',
  statusOld: 'Deze lijst is mogelijk verouderd (laatst bijgewerkt: {date}).',
  pageOf: 'Pagina {page} van {pages}',
  slideOf: '{n} van {total}',
  pause: 'Pauzeren',
  play: 'Hervatten',
  prev: 'Vorige',
  next: 'Volgende',
  fullscreen: 'Volledig scherm',
  allListLabel: 'Alle huidige interne vacatures',
  more: '+{n} meer',
  newCount: '{n} nieuw',
  closingCount: '{n} sluiten binnenkort',
  tickerLabel: 'Nieuwste interne vacatures'
};

const es = {
  brand: 'Cooneen Group',
  title: 'Vacantes internas',
  tagline: 'Oportunidades para los compañeros de Cooneen',
  count: { one: '{n} vacante abierta', other: '{n} vacantes abiertas' },
  badgeNew: 'Nuevo',
  badgeFeatured: 'Destacado',
  badgeClosing: 'Cierra pronto',
  closesToday: 'Cierra hoy',
  closesTomorrow: 'Cierra mañana',
  closesInDays: { other: 'Cierra en {n} días' },
  closesOn: 'Cierra el {date}',
  postedToday: 'Publicado hoy',
  postedYesterday: 'Publicado ayer',
  postedDaysAgo: { other: 'Publicado hace {n} días' },
  postedOn: 'Publicado el {date}',
  scanToView: 'Escanea para ver la vacante',
  scanHint: 'Usa la cámara del móvil',
  allVacancies: 'Ver todas las vacantes',
  labelLocation: 'Ubicación',
  labelDepartment: 'Departamento',
  labelType: 'Tipo de contrato',
  remote: 'Trabajo remoto',
  ref: 'Ref. {ref}',
  loadingTitle: 'Cargando vacantes…',
  errorTitle: 'No se pueden cargar las vacantes en este momento',
  errorBody: 'Esta pantalla lo seguirá intentando y mostrará la lista en cuanto esté disponible.',
  emptyTitle: 'No hay vacantes internas en este momento',
  emptyBody: 'Los nuevos puestos se anuncian primero aquí. Vuelve pronto.',
  statusUpdated: 'Actualizado a las {time}',
  statusOffline: 'No se puede conectar con el servicio. Mostrando la lista de las {time}.',
  statusOld: 'Es posible que esta lista esté desactualizada (última actualización: {date}).',
  pageOf: 'Página {page} de {pages}',
  slideOf: '{n} de {total}',
  pause: 'Pausar',
  play: 'Reanudar',
  prev: 'Anterior',
  next: 'Siguiente',
  fullscreen: 'Pantalla completa',
  allListLabel: 'Todas las vacantes internas actuales',
  more: '+{n} más',
  newCount: { one: '{n} nueva', other: '{n} nuevas' },
  closingCount: { one: '{n} cierra pronto', other: '{n} cierran pronto' },
  tickerLabel: 'Últimas vacantes internas'
};

const ro = {
  brand: 'Cooneen Group',
  title: 'Posturi vacante interne',
  tagline: 'Oportunități pentru colegii de la Cooneen',
  count: { one: '{n} post vacant', few: '{n} posturi vacante', other: '{n} de posturi vacante' },
  badgeNew: 'Nou',
  badgeFeatured: 'Recomandat',
  badgeClosing: 'Se închide curând',
  closesToday: 'Se închide azi',
  closesTomorrow: 'Se închide mâine',
  closesInDays: { few: 'Se închide în {n} zile', other: 'Se închide în {n} de zile' },
  closesOn: 'Se închide pe {date}',
  postedToday: 'Postat azi',
  postedYesterday: 'Postat ieri',
  postedDaysAgo: { few: 'Postat acum {n} zile', other: 'Postat acum {n} de zile' },
  postedOn: 'Postat pe {date}',
  scanToView: 'Scanează pentru a vedea postul',
  scanHint: 'Folosește camera telefonului',
  allVacancies: 'Vezi toate posturile',
  labelLocation: 'Locație',
  labelDepartment: 'Departament',
  labelType: 'Tip de contract',
  remote: 'Lucru de la distanță',
  ref: 'Ref. {ref}',
  loadingTitle: 'Se încarcă posturile…',
  errorTitle: 'Posturile nu pot fi încărcate momentan',
  errorBody: 'Acest ecran încearcă din nou automat și va afișa lista imediat ce este disponibilă.',
  emptyTitle: 'Momentan nu există posturi vacante interne',
  emptyBody: 'Posturile noi sunt anunțate mai întâi aici. Revino în curând.',
  statusUpdated: 'Actualizat la {time}',
  statusOffline: 'Serviciul nu poate fi accesat. Se afișează lista de la {time}.',
  statusOld: 'Lista poate fi depășită (ultima actualizare: {date}).',
  pageOf: 'Pagina {page} din {pages}',
  slideOf: '{n} din {total}',
  pause: 'Pauză',
  play: 'Reia',
  prev: 'Înapoi',
  next: 'Înainte',
  fullscreen: 'Ecran complet',
  allListLabel: 'Toate posturile vacante interne actuale',
  more: '+{n} în plus',
  newCount: { one: '{n} nou', few: '{n} noi', other: '{n} de noi' },
  closingCount: '{n} se închid curând',
  tickerLabel: 'Cele mai noi posturi interne'
};

export const DICT = { en, fr, de, nl, es, ro };

const LOCALES = { en: 'en-GB', fr: 'fr-FR', de: 'de-DE', nl: 'nl-NL', es: 'es-ES', ro: 'ro-RO' };

/* Used by the tests: every language must have every English key with the same placeholders. */
export function validateDictionary() {
  const problems = [];
  const placeholders = (v) => {
    const all = typeof v === 'string' ? [v] : Object.keys(v).map((k) => v[k]);
    const found = {};
    all.forEach((s) => { (s.match(/\{\w+\}/g) || []).forEach((p) => { found[p] = true; }); });
    return Object.keys(found).sort().join(',');
  };
  Object.keys(DICT).forEach((lang) => {
    Object.keys(en).forEach((key) => {
      if (DICT[lang][key] === undefined) { problems.push(lang + ': missing ' + key); return; }
      if (placeholders(DICT[lang][key]) !== placeholders(en[key])) problems.push(lang + ': placeholders differ in ' + key);
    });
    Object.keys(DICT[lang]).forEach((key) => { if (en[key] === undefined) problems.push(lang + ': extra key ' + key); });
  });
  return problems;
}

export function createI18n(lang) {
  const code = DICT[lang] ? lang : 'en';
  const dict = DICT[code];
  const locale = LOCALES[code];
  let rules = null;
  try { rules = new Intl.PluralRules(locale); } catch (e) { rules = null; }

  let dateFmt = null;
  let timeFmt = null;
  let dateTimeFmt = null;
  try {
    dateFmt = new Intl.DateTimeFormat(locale, { timeZone: TZ, day: 'numeric', month: 'short' });
    timeFmt = new Intl.DateTimeFormat(locale, { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false });
    dateTimeFmt = new Intl.DateTimeFormat(locale, { timeZone: TZ, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
  } catch (e) { /* the plain fallbacks below are used */ }

  function fill(text, vars) {
    return text.replace(/\{(\w+)\}/g, (match, name) => (vars && vars[name] !== undefined ? String(vars[name]) : match));
  }

  function t(key, vars) {
    let value = dict[key];
    if (value === undefined) value = en[key];
    if (value === undefined) return key;
    if (typeof value === 'object') {
      const n = vars && typeof vars.n === 'number' ? vars.n : 1;
      const category = rules ? rules.select(n) : (n === 1 ? 'one' : 'other');
      value = value[category] !== undefined ? value[category] : (value.other !== undefined ? value.other : value.one);
    }
    return fill(value, vars);
  }

  return {
    lang: code,
    locale,
    t,
    date(ms) { return isFinite(ms) ? (dateFmt ? dateFmt.format(new Date(ms)) : new Date(ms).toDateString()) : ''; },
    time(ms) { return isFinite(ms) ? (timeFmt ? timeFmt.format(new Date(ms)) : new Date(ms).toTimeString().slice(0, 5)) : ''; },
    dateTime(ms) { return isFinite(ms) ? (dateTimeFmt ? dateTimeFmt.format(new Date(ms)) : new Date(ms).toLocaleString()) : ''; }
  };
}
