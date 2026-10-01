/* Display builder: a form generated from the same SCHEMA that the display itself uses to read its settings,
   so the two can never disagree. It only writes the address; nothing is stored anywhere. */

import { SCHEMA, parseConfig } from './config.js';
import { el, clear } from './dom.js';

const PRESETS = [
  { name: 'Reception / lobby: one vacancy at a time, big', set: { mode: 'hero' }, size: '1920x1080' },
  { name: 'Canteen / corridor: two vacancies side by side', set: { mode: 'duo' }, size: '1920x1080' },
  { name: 'Canteen / factory wall: all vacancies', set: { mode: 'kiosk' }, size: '1920x1080' },
  { name: 'Portrait screen: one at a time', set: { mode: 'carousel', kiosk: '1' }, size: '1080x1920' },
  { name: 'Intranet / SharePoint / Teams widget', set: { mode: 'widget', theme: 'light' }, size: '420x560' },
  { name: 'Footer strip: scrolling ticker', set: { mode: 'ticker' }, size: '1920x120' }
];
const SIZES = [
  ['1920x1080', 'Landscape screen 1920 × 1080'], ['1280x720', 'Landscape screen 1280 × 720'], ['3840x2160', 'Landscape screen 4K'],
  ['1080x1920', 'Portrait screen 1080 × 1920'], ['800x1280', 'Portrait tablet 800 × 1280'],
  ['420x560', 'Widget 420 × 560'], ['600x700', 'Widget 600 × 700'], ['1920x120', 'Ticker strip 1920 × 120'], ['1080x100', 'Ticker strip 1080 × 100']
];
const GROUPS = ['Display', 'Layout', 'Content', 'Behaviour', 'Vacancies'];

const form = document.getElementById('form');
const out = document.getElementById('out');
const openLink = document.getElementById('open');
const copyBtn = document.getElementById('copy');
const copied = document.getElementById('copied');
const issuesEl = document.getElementById('issues');
const sizeSel = document.getElementById('size');
const wrap = document.getElementById('wrap');
const frame = document.getElementById('preview');

const base = new URL('./', window.location.href);
const controls = {};          /* key -> { spec, input, row } */
let frameTimer = 0;

/* ---------- build the form ---------- */
function labelFor(spec) { return spec.key; }

function makeControl(spec) {
  const id = 'f-' + spec.key;
  let input;
  if (spec.type === 'enum' || spec.type === 'intenum' || spec.type === 'bool' || spec.type === 'tri') {
    input = el('select');
    input.appendChild(el('option', null, 'Default'));
    input.firstChild.value = '';
    const options = spec.type === 'enum' || spec.type === 'intenum'
      ? spec.values.map((v) => [String(v), String(v)])
      : [['1', 'On'], ['0', 'Off']];
    options.forEach(([value, text]) => {
      const o = el('option', null, text);
      o.value = value;
      input.appendChild(o);
    });
  } else {
    input = el('input');
    if (spec.type === 'int' || spec.type === 'num') {
      input.type = 'number';
      input.min = String(spec.min);
      input.max = String(spec.max);
      input.step = spec.type === 'num' ? '0.1' : '1';
      input.placeholder = 'Default';
      input.inputMode = 'decimal';
    } else {
      input.type = 'text';
      input.placeholder = spec.type === 'list' ? 'a, b, c' : spec.type === 'time' ? '03:30 or off' : 'Default';
      if (spec.max) input.maxLength = spec.max;
      input.spellcheck = false;
    }
  }
  input.id = id;
  input.addEventListener('input', update);
  input.addEventListener('change', update);

  const row = el('div', 'field');
  const label = el('label', null, labelFor(spec));
  label.htmlFor = id;
  const help = el('p', 'help', spec.desc);
  help.id = id + '-help';
  input.setAttribute('aria-describedby', help.id);
  row.appendChild(label);
  row.appendChild(input);
  row.appendChild(help);
  controls[spec.key] = { spec, input, row };
  return row;
}

function build() {
  const presets = el('fieldset', 'group');
  presets.appendChild(el('legend', null, 'Start from'));
  const bar = el('div', 'presets');
  PRESETS.forEach((preset) => {
    const b = el('button', 'btn btn-ghost', preset.name);
    b.type = 'button';
    b.addEventListener('click', () => {
      Object.keys(controls).forEach((k) => { controls[k].input.value = ''; });
      Object.keys(preset.set).forEach((k) => { controls[k].input.value = preset.set[k]; });
      sizeSel.value = preset.size;
      update();
    });
    bar.appendChild(b);
  });
  const reset = el('button', 'btn btn-ghost', 'Reset everything');
  reset.type = 'button';
  reset.addEventListener('click', () => { Object.keys(controls).forEach((k) => { controls[k].input.value = ''; }); update(); });
  bar.appendChild(reset);
  presets.appendChild(bar);
  form.appendChild(presets);

  GROUPS.forEach((group) => {
    const fieldset = el('fieldset', 'group');
    fieldset.appendChild(el('legend', null, group));
    SCHEMA.filter((s) => s.group === group).forEach((spec) => fieldset.appendChild(makeControl(spec)));
    form.appendChild(fieldset);
  });
  /* "diag" is a support tool; keep it at the very end */
  const support = el('fieldset', 'group');
  support.appendChild(el('legend', null, 'Support'));
  SCHEMA.filter((s) => s.group === 'Support').forEach((spec) => support.appendChild(makeControl(spec)));
  form.appendChild(support);

  SIZES.forEach(([value, text]) => { const o = el('option', null, text); o.value = value; sizeSel.appendChild(o); });
}

/* ---------- read / write the address ---------- */
function query() {
  const parts = [];
  SCHEMA.forEach((spec) => {
    const c = controls[spec.key];
    const v = c.input.value.trim();
    if (v !== '') parts.push(encodeURIComponent(spec.key) + '=' + encodeURIComponent(v).replace(/%2C/g, ',').replace(/%3A/g, ':'));
  });
  return parts.join('&');
}

function prefill() {
  const incoming = new URLSearchParams(window.location.search);
  incoming.forEach((value, key) => {
    const spec = SCHEMA.filter((s) => s.key.toLowerCase() === key.toLowerCase())[0];
    if (spec && controls[spec.key]) controls[spec.key].input.value = value;
  });
}

function update() {
  const q = query();
  const url = new URL(base.href);
  url.search = q ? '?' + q : '';
  out.value = url.href;
  openLink.href = url.href;
  copied.textContent = '';

  /* applicability: dim settings that do nothing in the chosen mode */
  const mode = controls.mode.input.value || 'wall';
  const layout = mode === 'kiosk' ? 'wall' : mode;
  SCHEMA.forEach((spec) => {
    const applies = !spec.modes || spec.modes.indexOf(mode) >= 0 || spec.modes.indexOf(layout) >= 0;
    controls[spec.key].row.classList.toggle('is-inactive', !applies);
  });

  /* what the display itself makes of this address (it reports anything it would ignore) */
  const issues = parseConfig('?' + q).issues;
  issuesEl.hidden = !issues.length;
  issuesEl.textContent = issues.length ? 'The display will adjust or ignore: ' + issues.map((i) => i.key + '=' + i.value + ' (' + i.problem + ')').join('; ') : '';

  window.clearTimeout(frameTimer);
  frameTimer = window.setTimeout(() => { frame.src = url.pathname + url.search; fit(); }, 350);
  fit();
}

/* ---------- preview sizing ---------- */
function fit() {
  const parts = sizeSel.value.split('x').map(Number);
  const w = parts[0];
  const h = parts[1];
  const availW = wrap.clientWidth || 600;
  const maxH = Math.max(260, Math.round(window.innerHeight * 0.62));
  const k = Math.min(1, availW / w, maxH / h);
  frame.style.width = w + 'px';
  frame.style.height = h + 'px';
  frame.style.transform = 'scale(' + k + ')';
  wrap.style.height = Math.round(h * k) + 'px';
}

copyBtn.addEventListener('click', () => {
  const done = () => { copied.textContent = 'Address copied.'; };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(out.value).then(done, () => { out.select(); copied.textContent = 'Press Ctrl+C to copy the selected address.'; });
  } else {
    out.select();
    copied.textContent = 'Press Ctrl+C to copy the selected address.';
  }
});
out.addEventListener('focus', () => out.select());
sizeSel.addEventListener('change', fit);
window.addEventListener('resize', fit);

clear(form);
build();
prefill();
update();
