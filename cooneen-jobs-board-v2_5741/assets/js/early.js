/* Runs before the page is drawn so the right theme colours are there from the first frame
   (no flash of the wrong background). The full, validated settings are read later in main.js. */
(function () {
  try {
    var q = {};
    new URLSearchParams(window.location.search).forEach(function (v, k) {
      k = k.toLowerCase();
      if (!(k in q)) q[k] = v;
    });
    var themes = ['cooneen', 'dark', 'light', 'highcontrast', 'portal'];
    var theme = String(q.theme || '').toLowerCase();
    var root = document.documentElement;
    root.setAttribute('data-theme', themes.indexOf(theme) >= 0 ? theme : 'cooneen');
    var kiosk = String(q.kiosk === undefined ? '' : q.kiosk).toLowerCase();
    if (String(q.mode || '').toLowerCase() === 'kiosk' || kiosk === '' && q.kiosk !== undefined || kiosk === '1' || kiosk === 'true' || kiosk === 'yes' || kiosk === 'on') {
      root.classList.add('kiosk');
    }
  } catch (e) { /* main.js sets everything again */ }
})();
