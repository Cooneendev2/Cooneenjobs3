/* Widget: a compact panel for intranet pages, SharePoint web parts and Teams tabs.
   Shows the vacancy count, how many are new / closing soon, and the latest ?rows= vacancies. */

import { el, clear, icon } from '../dom.js';
import { shortLocation } from '../vacancies.js';
import { CAREERS_URL } from '../store.js';
import { createBadges, closingText, createStatus, createStatePanel, createBrandPlate, fitOneLine } from '../components.js';

export function mount(ctx) {
  const { app, cfg, i18n } = ctx;
  const t = i18n.t;
  const root = el('div', 'mode mode-widget');
  app.appendChild(root);

  /* The same Cooneen branding as the big screens, in compact form: logo, then INTERNAL VACANCIES. */
  const head = el('header', 'w-head');
  const wTitle = el('h1', 'w-title', cfg.title || t('title'));
  const fitTitle = () => fitOneLine(head, wTitle, '--ht');
  head.appendChild(createBrandPlate(ctx, fitTitle));
  head.appendChild(wTitle);
  root.appendChild(head);
  ctx.stage.onChange(fitTitle);

  /* Summary chips: how many vacancies, how many new, how many closing soon. They double as the legend
     for the icons on the rows below. */
  const chips = el('ul', 'w-chips');
  root.appendChild(chips);

  const body = el('main', 'w-body');
  const list = el('ul', 'w-list');
  body.appendChild(list);
  const stateHost = el('div', 'state-host');
  stateHost.hidden = true;
  body.appendChild(stateHost);
  root.appendChild(body);

  const foot = el('footer', 'w-foot');
  const status = createStatus(ctx);
  foot.appendChild(status.el);
  const all = el('a', 'w-all');
  all.href = CAREERS_URL;
  all.target = '_blank';
  all.rel = 'noopener noreferrer';
  all.appendChild(el('span', null, t('allVacancies')));
  all.appendChild(icon('arrow'));
  if (ctx.links) foot.appendChild(all);
  root.appendChild(foot);

  let view = null;

  function row(item) {
    const job = item.job;
    const linked = ctx.links && job.url;
    const li = el('li', 'w-item');
    const inner = el(linked ? 'a' : 'div', 'w-row');
    if (linked) {
      inner.href = job.url;
      inner.target = '_blank';
      inner.rel = 'noopener noreferrer';
    }
    const text = el('div', 'w-text');
    text.appendChild(el('p', 'w-job', job.title));
    const meta = [];
    if (cfg.showLocation && job.location) meta.push(shortLocation(job.location, cfg.fullLocation));
    if (cfg.showDepartment && job.department) meta.push(job.department);
    if (meta.length) text.appendChild(el('p', 'w-meta', meta.join(', ')));
    const closing = item.closingSoon ? closingText(item, ctx) : '';
    if (closing) text.appendChild(el('p', 'w-soon', closing));
    inner.appendChild(text);
    const badges = createBadges(item, ctx, { compact: true });
    if (badges) inner.appendChild(badges);
    li.appendChild(inner);
    return li;
  }

  function chip(textValue, kind, iconName) {
    const li = el('li', 'w-chip w-chip-' + kind);
    li.appendChild(icon(iconName));
    li.appendChild(el('span', null, textValue));
    chips.appendChild(li);
  }

  function draw() {
    fitTitle();
    const items = view.items;
    clear(chips);
    const fresh = items.filter((it) => it.isNew).length;
    const closing = items.filter((it) => it.closingSoon).length;
    const featured = items.filter((it) => it.badges.indexOf('featured') >= 0).length;
    chip(t('count', { n: items.length }), 'count', 'team');
    if (fresh) chip(t('newCount', { n: fresh }), 'new', 'bolt');
    if (closing) chip(t('closingCount', { n: closing }), 'closing', 'clock');
    if (featured) chip(featured + ' ' + t('badgeFeatured'), 'featured', 'star');

    chips.hidden = false;
    let shown = layoutRows(items);
    /* A very small panel: the summary chips give way to the vacancies themselves. */
    if (shown < Math.min(2, items.length, cfg.rows)) {
      chips.hidden = true;
      shown = layoutRows(items);
    }
  }

  /* Put as many of the wanted rows as fit in the space the host page gave us, then say how many are not shown. */
  function layoutRows(items) {
    clear(list);
    const wanted = Math.min(cfg.rows, items.length);
    for (let i = 0; i < wanted; i += 1) list.appendChild(row(items[i]));
    const over = () => list.scrollHeight > body.clientHeight + 1;
    let shown = wanted;
    while (shown > 1 && over()) {
      list.removeChild(list.lastChild);
      shown -= 1;
    }
    const hidden = items.length - shown;
    if (hidden > 0) {
      const more = el('li', 'w-more', t('more', { n: hidden }));
      list.appendChild(more);
      if (over()) {
        if (shown > 1) {
          list.removeChild(more.previousSibling);
          shown -= 1;
          more.textContent = t('more', { n: hidden + 1 });
        }
        if (over()) list.removeChild(more);
      }
    }
    return shown;
  }

  return {
    update(v) {
      view = v;
      status.update(v);
      if (v.status !== 'ok') {
        clear(chips); chips.hidden = true;
        clear(list); clear(stateHost);
        list.hidden = true;
        stateHost.hidden = false;
        stateHost.appendChild(createStatePanel(v.status, ctx));
        return;
      }
      list.hidden = false;
      clear(stateHost);
      stateHost.hidden = true;
      draw();
    },
    resize() { if (view && view.status === 'ok') draw(); },
    refit() { if (view && view.status === 'ok') draw(); },
    tick() { /* nothing time-based on screen except badges, handled by update() */ },
    hold() {},
    info() { return { mode: 'widget', rows: cfg.rows, shown: list.querySelectorAll('.w-item').length }; },
    destroy() { root.remove(); }
  };
}
