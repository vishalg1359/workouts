'use strict';

const STORE_KEY = 'workouts.v1';
const DEFAULT_PRESETS = ['Upper Day', 'Lower Day', 'Push Day', 'Pull Day', 'Leg Day', 'Mobility Day'];
const DEFAULT_PRESET_COLORS = { 'upper day': '#2563eb', 'lower day': '#16a34a', 'push day': '#dc2626', 'pull day': '#7c3aed', 'leg day': '#d97706', 'mobility day': '#0d9488' };
const DEFAULT_PROFILE = { name: '', birthday: '', units: 'imperial', heightCm: null, weightKg: null, theme: 'auto', accent: '#1e40af', pop: '#f97316' };
const UNITS = ['sets', 'reps', 'lb', 'kg', 'sec', 'min', 'hr', 'mi', 'km', 'm', 'rounds', 'cal'];
const JOINS = ['×', 'at', 'for', '@', 'of', '+', '/'];
const OTHER = '\u0000other';
const EDIT = '\u0000edit';
const PAGE_DAYS = 60;
const NO_CAPS = { autocapitalize: 'none', autocorrect: 'off', spellcheck: 'false' };

// ---------- storage ----------
function migrateDays(days) {
  Object.values(days).forEach((day) => (day.entries || []).forEach((e) => {
    if (!Array.isArray(e.sets)) e.sets = [Array.isArray(e.spec) ? e.spec : []];
    delete e.spec;
  }));
  return days;
}
function normalize(s) {
  return {
    exercises: Array.isArray(s.exercises) ? s.exercises : [],
    days: s.days && typeof s.days === 'object' ? migrateDays(s.days) : {},
    presets: (Array.isArray(s.presets) ? s.presets : DEFAULT_PRESETS.slice()).filter((p) => !/^rest\b/i.test(p)),
    presetColors: s.presetColors && typeof s.presetColors === 'object' ? s.presetColors : { ...DEFAULT_PRESET_COLORS },
    profile: { ...DEFAULT_PROFILE, ...(s.profile || {}) },
    units: Array.isArray(s.units) ? s.units : UNITS.slice(),
    joins: Array.isArray(s.joins) ? s.joins.filter(Boolean) : JOINS.slice(),
  };
}
function load() {
  const raw = localStorage.getItem(STORE_KEY);
  if (raw) {
    try { return normalize(JSON.parse(raw)); } catch (_) {
      localStorage.setItem(`${STORE_KEY}.unreadable.${Date.now()}`, raw);
    }
  }
  return normalize({});
}
let state = load();
function save() { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

// ---------- dates ----------
const pad = (n) => String(n).padStart(2, '0');
const keyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dateOf = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const today = () => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); };
const todayKey = () => keyOf(today());
const minDate = (a, b) => (a < b ? a : b);
const maxDate = (a, b) => (a > b ? a : b);

// ---------- dom helper ----------
function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  let value;
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'value') value = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  if (value !== undefined) el.value = value;
  return el;
}

const isImage = (u) => /^(https?:\/\/\S+|data:image\/)/i.test((u || '').trim());

function icon(item, size) {
  const cls = `ico${size ? ` ${size}` : ''}`;
  const letter = h('div', { class: `${cls} letter` }, (item.name || '?').trim().charAt(0) || '?');
  if (!isImage(item.image)) return letter;
  const img = h('img', { class: cls, src: item.image.trim(), alt: '', referrerpolicy: 'no-referrer' });
  img.addEventListener('error', () => img.replaceWith(letter));
  return img;
}

// ---------- spec blocks ----------
// A spec is a list of blocks: { join, value, unit }. e.g. [ {'',3,'sets'}, {'×','','reps'}, {'at','','lb'} ]
const cloneSpec = (spec) => (spec || []).map((b) => ({ join: b.join || '', value: b.value || '', unit: b.unit || '' }));
const weightUnit = () => (state.profile.units === 'metric' ? 'kg' : 'lb');

function specSummary(spec, blankMark) {
  return (spec || []).map((b, i) => {
    const parts = [];
    if (i > 0 && b.join) parts.push(b.join);
    const v = String(b.value || '').trim();
    if (v || blankMark) parts.push(v || blankMark);
    if (b.unit) parts.push(b.unit);
    return parts.join(' ');
  }).filter(Boolean).join(' ');
}

// Unit / joining-word dropdowns backed by editable lists (state.units, state.joins).
const LISTS = {
  unit: { key: 'units', defaults: UNITS, title: 'Units', prompt: 'New unit', blank: false },
  join: { key: 'joins', defaults: JOINS, title: 'Joining words', prompt: 'New joining word', blank: true },
};
function fillOptions(sel, kind, current) {
  const L = LISTS[kind];
  const opts = state[L.key].slice();
  if (L.blank) opts.push('');
  if (current && !opts.includes(current)) opts.push(current);
  sel.replaceChildren(...opts.map((o) => h('option', { value: o }, o === '' ? '—' : o)),
    h('option', { value: OTHER }, 'other…'), h('option', { value: EDIT }, 'edit list…'));
  sel.value = current;
  sel.style.width = `calc(${Math.max(1, (current || '—').length)}ch + 12px)`;
}
function listSelect(kind, block, onChange, label) {
  const L = LISTS[kind];
  const sel = h('select', { class: kind, 'aria-label': label, 'data-kind': kind });
  sel._block = block;
  fillOptions(sel, kind, block[kind]);
  sel.addEventListener('change', () => {
    const v = sel.value;
    if (v === EDIT) { fillOptions(sel, kind, block[kind]); openListEditor(kind); return; }
    if (v === OTHER) {
      const custom = (prompt(L.prompt) || '').trim();
      if (!custom) { fillOptions(sel, kind, block[kind]); return; }
      if (!state[L.key].includes(custom)) { state[L.key].push(custom); save(); }
      block[kind] = custom;
    } else block[kind] = v;
    fillOptions(sel, kind, block[kind]);
    onChange();
  });
  return sel;
}
const unitSelect = (block, onChange) => listSelect('unit', block, onChange, 'Unit');
const joinSelect = (block, onChange) => listSelect('join', block, onChange, 'Joining word');

function refreshListSelects(kind) {
  document.querySelectorAll(`select[data-kind="${kind}"]`).forEach((s) => { if (s._block) fillOptions(s, kind, s._block[kind]); });
}

// Separate small sheet on top of any open sheet, so editing a list never loses a half-filled form.
function openListEditor(kind) {
  const L = LISTS[kind];
  const list = state[L.key];
  const back = h('div', { class: 'backdrop', style: 'z-index: 40' });
  const body = h('div', { class: 'sheet-body' });
  const close = () => { back.remove(); box.remove(); refreshListSelects(kind); };
  const box = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', style: 'z-index: 41' },
    h('div', { class: 'sheet-head' }, h('span', { class: 'sheet-spacer' }), h('h3', {}, L.title), h('button', { class: 'link', onclick: close }, 'Done')),
    body);
  back.addEventListener('click', close);
  const rows = h('div', {});
  const draw = () => {
    rows.replaceChildren(...list.map((v, i) => h('div', { class: 'choice' },
      h('div', { class: 'grow' }, v),
      h('button', { class: 'x', 'aria-label': `Remove ${v}`, onclick: () => { list.splice(i, 1); save(); draw(); } }, '×'))));
  };
  draw();
  const input = h('input', { 'aria-label': L.prompt, enterkeyhint: 'done', ...NO_CAPS });
  const add = () => {
    const v = input.value.trim();
    if (v && !list.includes(v)) { list.push(v); save(); draw(); }
    input.value = '';
  };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });
  body.append(rows,
    h('div', { class: 'add-preset' }, input, h('button', { onclick: add }, 'Add')),
    h('button', { class: 'btn', onclick: () => { list.splice(0, list.length, ...L.defaults); save(); draw(); } }, 'Reset to defaults'),
    h('p', { class: 'hint' }, 'Removing an item only hides it from the list. Anything already logged keeps it.'));
  document.body.append(back, box);
}

function valueInput(block, onChange) {
  const inp = h('input', { class: 'val', value: block.value || '', inputmode: 'decimal', enterkeyhint: 'next', 'aria-label': block.unit || 'Value', ...NO_CAPS });
  const size = () => { inp.style.width = `${Math.max(2.6, inp.value.length + 1.4)}ch`; };
  size();
  inp.addEventListener('input', () => { block.value = inp.value; size(); onChange(); });
  return inp;
}

// Inline blocks on a logged entry: fill in numbers, switch units.
function specInline(spec, onChange) {
  return h('div', { class: 'spec' }, spec.map((b, i) => h('span', { class: 'blk' },
    i > 0 && b.join ? h('span', { class: 'jw' }, b.join) : null,
    valueInput(b, onChange),
    unitSelect(b, onChange))));
}

// Block builder used in the exercise form and entry editor.
function blockEditor(spec) {
  const wrap = h('div', { class: 'blocks' });
  const draw = () => {
    wrap.textContent = '';
    spec.forEach((b, i) => {
      wrap.append(h('div', { class: 'brow' },
        i > 0 ? joinSelect(b, () => {}) : h('span', { class: 'join-spacer' }),
        valueInput(b, () => {}),
        unitSelect(b, () => {}),
        h('button', { class: 'x', 'aria-label': 'Remove block', onclick: () => { spec.splice(i, 1); draw(); } }, '×')));
    });
    const nextUnit = ['sets', 'reps', weightUnit()][spec.length] || 'reps';
    const nextJoin = ['', '×', 'at'][spec.length] || '×';
    wrap.append(h('button', { class: 'btn small', onclick: () => { spec.push({ join: spec.length ? nextJoin : '', value: '', unit: nextUnit }); draw(); } }, '+ Add block'));
    if (!spec.length) {
      const shapes = [
        ['sets × reps', [['', 'sets'], ['×', 'reps']]],
        [`sets × reps at ${weightUnit()}`, [['', 'sets'], ['×', 'reps'], ['at', weightUnit()]]],
        ['sets for sec', [['', 'sets'], ['for', 'sec']]],
        ['min', [['', 'min']]],
      ];
      wrap.append(h('div', { class: 'shapes' }, shapes.map(([label, blocks]) => h('button', { class: 'pill', onclick: () => {
        blocks.forEach(([join, unit]) => spec.push({ join, value: '', unit }));
        draw();
      } }, label))));
    }
  };
  draw();
  return wrap;
}

function exerciseText(item, blankMark) {
  const summary = specSummary(item.spec, blankMark);
  return h('div', { class: 'etext' },
    h('div', { class: 'ename' }, item.name),
    summary ? h('div', { class: 'edetails' }, summary) : null,
    item.details ? h('div', { class: 'edetails' }, item.details) : null);
}

// ---------- day data ----------
function getDay(key) { return state.days[key]; }
function ensureDay(key) { return (state.days[key] ||= { name: '', entries: [] }); }
function cleanupDay(key) {
  const d = state.days[key];
  if (d && !d.name.trim() && d.entries.length === 0) delete state.days[key];
}

// ---------- log feed (every day, oldest at top; loads forever both ways) ----------
const feedEl = document.getElementById('feed');
const logTitle = document.getElementById('log-title');
let rangeOldest;
let rangeNewest;
const monthStart = (d, n = 0) => new Date(d.getFullYear(), d.getMonth() + n, 1);
const monthEnd = (d, n = 0) => new Date(d.getFullYear(), d.getMonth() + n + 1, 0);

function initRange() {
  rangeOldest = monthStart(today(), -2);
  rangeNewest = monthEnd(today(), 1);
}

const fmt = (d, o) => d.toLocaleDateString(undefined, o);
function isRestDay(key, day) {
  if (day && day.entries.length) return false;
  if (day && day.name) return /\brest\b/i.test(day.name);
  return key < todayKey();
}
const dayColor = (day) => (day && day.name ? state.presetColors[day.name.trim().toLowerCase()] : '') || '';

function monthHeader(d) {
  return h('div', { class: 'mhead', 'data-anchor': `m${keyOf(d)}`, 'data-month': keyOf(d) },
    h('span', { class: 'mname' }, fmt(d, { month: 'long' })),
    h('span', { class: 'myear' }, d.getFullYear()));
}

function nameField(key, day) {
  const input = h('input', { class: 'dayname', value: day ? day.name : '', enterkeyhint: 'done', 'aria-label': 'Day name', ...NO_CAPS });
  input.addEventListener('input', () => { ensureDay(key).name = input.value; save(); });
  input.addEventListener('blur', () => { cleanupDay(key); save(); });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); });
  return input;
}

const isDone = (key, entry) => (entry.done == null ? key < todayKey() : entry.done);

function doneSummary(spec) {
  return spec.filter((b) => String(b.value || '').trim())
    .map((b, i) => [i > 0 ? b.join : '', String(b.value).trim(), b.unit].filter(Boolean).join(' '))
    .join(' ');
}

function renderEntry(key, entry) {
  const done = isDone(key, entry);
  const head = h('div', { class: 'ex-head' },
    icon(entry, 'sm'),
    h('button', { class: 'ename', onclick: () => openEntryEditor(key, entry.id) }, entry.name));
  const rows = done
    ? entry.sets.map(doneSummary).filter(Boolean).map((t) => h('button', { class: 'set-text', onclick: () => openEntryEditor(key, entry.id) }, t))
    : entry.sets.map((spec, i) => h('div', { class: 'set' },
        specInline(spec, save),
        entry.sets.length > 1 ? h('button', { class: 'x', 'aria-label': 'Remove set',
          onclick: () => { entry.sets.splice(i, 1); save(); refreshDay(key); } }, '×') : null));
  const exEl = h('div', { class: `ex${done ? ' done' : ''}` }, head,
    h('div', { class: 'sets' }, rows,
      !done ? h('div', { class: 'ex-actions' },
        h('button', { class: 'add-set', onclick: () => {
          const last = entry.sets[entry.sets.length - 1] || [];
          entry.sets.push(cloneSpec(last));
          save();
          refreshDay(key);
        } }, '+ set'),
        h('button', { class: 'done-btn', onclick: () => { entry.done = true; save(); refreshDay(key); } }, 'Done')) : null),
    entry.details ? h('div', { class: 'edetails' }, entry.details) : null);
  const remove = () => {
    const day = getDay(key);
    if (!day) return;
    day.entries = day.entries.filter((e) => e.id !== entry.id);
    cleanupDay(key);
    save();
    refreshDay(key);
  };
  const wrap = h('div', { class: 'ex-wrap' },
    h('div', { class: 'ex-editbg', 'aria-hidden': 'true' }, 'Edit'),
    h('button', { class: 'ex-del', onclick: remove }, 'Delete'),
    exEl);
  swipeable(wrap, exEl, () => openEntryEditor(key, entry.id));
  return wrap;
}

// Swipe left reveals Delete; swipe right opens the editor.
let openSwipe = null;
function closeOpenSwipe() {
  if (!openSwipe) return;
  const w = openSwipe;
  openSwipe = null;
  w.classList.add('anim');
  w.lastChild.style.transform = '';
  setTimeout(() => w.classList.remove('sw-l', 'sw-r', 'anim'), 200);
}
function swipeable(wrap, el, onRight) {
  const OPEN = 84;
  let x0 = 0, y0 = 0, dx = 0, base = 0, mode = null, id = null;
  const swallowClick = () => {
    const stop = (c) => { c.stopPropagation(); c.preventDefault(); };
    el.addEventListener('click', stop, { capture: true, once: true });
    setTimeout(() => el.removeEventListener('click', stop, { capture: true }), 350);
  };
  const set = (x) => {
    el.style.transform = x ? `translateX(${x}px)` : '';
    wrap.classList.toggle('sw-l', x < 0);
    wrap.classList.toggle('sw-r', x > 0);
  };
  el.addEventListener('pointerdown', (e) => {
    if (e.button) return;
    if (openSwipe && openSwipe !== wrap) closeOpenSwipe();
    x0 = e.clientX; y0 = e.clientY; dx = 0; mode = null; id = e.pointerId;
    base = openSwipe === wrap ? -OPEN : 0;
    wrap.classList.remove('anim');
  });
  el.addEventListener('pointermove', (e) => {
    if (e.pointerId !== id) return;
    const mx = e.clientX - x0, my = e.clientY - y0;
    if (!mode) {
      if (Math.abs(mx) < 10 && Math.abs(my) < 10) return;
      mode = Math.abs(mx) > Math.abs(my) ? 'h' : 'v';
      if (mode === 'h') { try { el.setPointerCapture(id); } catch (_) {} if (document.activeElement && el.contains(document.activeElement)) document.activeElement.blur(); }
    }
    if (mode !== 'h') return;
    e.preventDefault();
    dx = mx;
    set(Math.max(-OPEN - 30, Math.min(140, base + dx)));
  });
  const end = (e) => {
    if (e.pointerId !== id) return;
    id = null;
    if (!mode && base) { closeOpenSwipe(); swallowClick(); return; }
    if (mode !== 'h') return;
    const x = base + dx;
    wrap.classList.add('anim');
    if (x < -OPEN / 2) { set(-OPEN); openSwipe = wrap; }
    else {
      set(0);
      if (openSwipe === wrap) openSwipe = null;
      if (x > 80) setTimeout(onRight, 120);
      setTimeout(() => wrap.classList.remove('sw-l', 'sw-r'), 200);
    }
    swallowClick();
    setTimeout(() => wrap.classList.remove('anim'), 220);
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', (e) => { if (e.pointerId === id) { id = null; if (mode === 'h') { set(base); } } });
}
document.addEventListener('pointerdown', (e) => { if (openSwipe && !openSwipe.contains(e.target)) closeOpenSwipe(); }, true);

function renderDay(key) {
  const date = dateOf(key);
  const day = getDay(key);
  const isToday = key === todayKey();
  const entries = day ? day.entries : [];
  const label = fmt(date, { weekday: 'short', month: 'short', day: 'numeric' });
  const rest = isRestDay(key, day);
  const color = dayColor(day);
  const head = h('div', { class: 'dhead' },
    h('span', { class: 'ddate' }, label),
    isToday ? h('span', { class: 'tpill' }, 'Today') : null,
    rest && !(day && day.name)
      ? h('button', { class: 'rest-label', onclick: () => openPresetPicker(key) }, '☾ Rest day')
      : nameField(key, day),
    h('button', { class: 'chip', 'aria-label': 'Pick a day name', onclick: () => openPresetPicker(key) }, '▾'),
    h('button', { class: 'chip add', 'aria-label': 'Add exercise', onclick: () => openExercisePicker(key) }, '+'));
  return h('div', { class: `day${isToday ? ' today' : ''}${rest ? ' rest' : ''}${entries.length ? ' has' : ''}${color ? ' tinted' : ''}`,
    style: color ? `--day:${color}` : null, 'data-anchor': key, 'data-key': key },
    head,
    entries.length ? h('div', { class: 'exs' }, entries.map((e) => renderEntry(key, e))) : null);
}

function renderRange(from, to) {
  const frag = document.createDocumentFragment();
  for (let d = from; d <= to; d = addDays(d, 1)) {
    if (d.getDate() === 1) frag.append(monthHeader(d));
    frag.append(renderDay(keyOf(d)));
  }
  return frag;
}

function renderFeed() {
  feedEl.replaceChildren(renderRange(rangeOldest, rangeNewest));
  updateTitle();
}

const topInset = () => document.querySelector('#view-log .topbar').getBoundingClientRect().bottom;
const bottomInset = () => document.querySelector('.tabbar').getBoundingClientRect().top;

// Run a DOM change while keeping whatever is on screen in the same place.
function keepAnchor(fn) {
  const top = topInset();
  let anchor = null;
  let offset = 0;
  let el0 = null;
  for (let y = top + 4; !el0 && y < top + 120; y += 20) {
    const hit = document.elementFromPoint(40, y);
    el0 = hit && hit.closest('[data-anchor]');
  }
  if (el0) { anchor = el0.dataset.anchor; offset = el0.getBoundingClientRect().top; }
  fn();
  const el = anchor && feedEl.querySelector(`[data-anchor="${anchor}"]`);
  if (el) window.scrollBy(0, el.getBoundingClientRect().top - offset);
}

function refreshDay(key) {
  keepAnchor(() => {
    const old = feedEl.querySelector(`[data-key="${key}"]`);
    if (old) old.replaceWith(renderDay(key));
  });
}

function scrollToKey(key, smooth, alignEnd) {
  const el = feedEl.querySelector(`[data-key="${key}"]`);
  if (!el) return;
  const top = topInset() + 8;
  const bottom = bottomInset() - 8;
  const r = el.getBoundingClientRect();
  const delta = alignEnd && r.height <= bottom - top ? r.bottom - bottom : r.top - top;
  window.scrollBy({ top: delta, behavior: smooth ? 'smooth' : 'auto' });
}
const scrollToToday = (smooth) => scrollToKey(todayKey(), smooth, true);

function jumpTo(key) {
  const d = dateOf(key);
  if (d < rangeOldest || d > rangeNewest) {
    rangeOldest = minDate(rangeOldest, monthStart(d));
    rangeNewest = maxDate(rangeNewest, monthEnd(d));
    renderFeed();
  }
  showView('log');
  requestAnimationFrame(() => scrollToKey(key, true, false));
}

const logActive = () => document.getElementById('view-log').classList.contains('active');
function extendPast() {
  const from = monthStart(rangeOldest, -2);
  const to = addDays(rangeOldest, -1);
  rangeOldest = from;
  keepAnchor(() => feedEl.prepend(renderRange(from, to)));
}
function extendFuture() {
  const from = addDays(rangeNewest, 1);
  rangeNewest = monthEnd(rangeNewest, 2);
  feedEl.append(renderRange(from, rangeNewest));
}

function updateTitle() {
  let el = null;
  for (let y = topInset() + 4; !el && y < topInset() + 120; y += 20) {
    const hit = document.elementFromPoint(40, y);
    el = hit && hit.closest('[data-key],[data-month]');
  }
  if (!el && logTitle.textContent !== 'Log') return;
  const d = el ? dateOf(el.dataset.key || el.dataset.month) : today();
  logTitle.textContent = d.getFullYear() === today().getFullYear() ? fmt(d, { month: 'long' }) : fmt(d, { month: 'short', year: 'numeric' });
}
let titleQueued = false;
window.addEventListener('scroll', () => {
  if (titleQueued || !logActive()) return;
  titleQueued = true;
  requestAnimationFrame(() => { titleQueued = false; updateTitle(); });
}, { passive: true });

document.getElementById('today-btn').addEventListener('click', () => scrollToToday(true));
const jumpInput = document.getElementById('jump-input');
jumpInput.addEventListener('change', () => { if (jumpInput.value) jumpTo(jumpInput.value); });
jumpInput.addEventListener('focus', () => { if (!jumpInput.value) jumpInput.value = todayKey(); });

// ---------- sheet ----------
const sheet = document.getElementById('sheet');
const backdrop = document.getElementById('sheet-backdrop');
const sheetBody = document.getElementById('sheet-body');
function openSheet(title, ...content) {
  document.getElementById('sheet-title').textContent = title;
  sheetBody.textContent = '';
  sheetBody.append(...content.filter((c) => c != null && c !== false && c !== ''));
  sheet.hidden = false;
  backdrop.hidden = false;
  sheetBody.scrollTop = 0;
}
function closeSheet() { sheet.hidden = true; backdrop.hidden = true; sheetBody.textContent = ''; }
backdrop.addEventListener('click', closeSheet);
document.getElementById('sheet-close').addEventListener('click', closeSheet);

function field(label, input) { return h('label', { class: 'field' }, h('span', {}, label), input); }
function fieldDiv(label, content) { return h('div', { class: 'field' }, h('span', {}, label), content); }

// ---------- day name presets ----------
function refreshFeedColors(name) {
  const ck = name.trim().toLowerCase();
  Object.keys(state.days).forEach((k) => {
    const d = state.days[k];
    if (d.name && d.name.trim().toLowerCase() === ck) refreshDay(k);
  });
}
function openPresetPicker(key) {
  const setName = (name) => {
    ensureDay(key).name = name;
    cleanupDay(key);
    save();
    closeSheet();
    refreshDay(key);
  };
  const list = h('div', {});
  const draw = () => {
    list.textContent = '';
    state.presets.forEach((p, i) => {
      const ck = p.trim().toLowerCase();
      const color = h('input', { type: 'color', class: 'pcolor', value: state.presetColors[ck] || '#64748b', 'aria-label': `${p} color` });
      color.addEventListener('input', () => { state.presetColors[ck] = color.value; save(); });
      color.addEventListener('change', () => refreshFeedColors(p));
      list.append(h('div', { class: 'choice' },
        color,
        h('div', { class: 'grow', onclick: () => setName(p) }, p),
        h('button', { class: 'x', 'aria-label': `Remove ${p}`, onclick: () => { state.presets.splice(i, 1); delete state.presetColors[ck]; save(); draw(); } }, '×')));
    });
  };
  draw();
  const custom = h('input', { 'aria-label': 'Day name', enterkeyhint: 'done', ...NO_CAPS });
  const useCustom = () => { const v = custom.value.trim(); if (v) setName(v); };
  const keepCustom = () => {
    const v = custom.value.trim();
    if (!v) return;
    if (!state.presets.includes(v)) state.presets.push(v);
    save();
    custom.value = '';
    draw();
  };
  custom.addEventListener('keydown', (e) => { if (e.key === 'Enter') useCustom(); });
  const day = getDay(key);
  openSheet('Day name',
    list,
    h('div', { class: 'add-preset' }, custom, h('button', { onclick: useCustom }, 'Use'), h('button', { class: 'soft', onclick: keepCustom }, 'Save to list')),
    day && day.name ? h('button', { class: 'btn', onclick: () => setName('') }, key < todayKey() ? 'Back to rest day' : 'Clear name') : null);
}

// ---------- exercise picker (add to a day) ----------
function sortedExercises() {
  return state.exercises.slice().sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}

function openExercisePicker(key) {
  const search = h('input', { class: 'search', type: 'search', 'aria-label': 'Search exercises', ...NO_CAPS });
  const list = h('div', {});
  const draw = () => {
    const q = search.value.trim().toLowerCase();
    list.textContent = '';
    if (!state.exercises.length) list.append(h('p', { class: 'empty' }, 'No exercises yet.'));
    for (const ex of sortedExercises().filter((x) => !q || x.name.toLowerCase().includes(q))) {
      list.append(h('div', { class: 'choice', onclick: () => addToDay(key, ex) }, icon(ex), h('div', { class: 'grow' }, exerciseText(ex, '__'))));
    }
  };
  search.addEventListener('input', draw);
  draw();
  openSheet(`Add to ${fmt(dateOf(key), { weekday: 'short', month: 'short', day: 'numeric' })}`,
    state.exercises.length > 6 ? search : null,
    list,
    h('button', { class: 'btn', onclick: () => openExerciseForm(null, () => openExercisePicker(key)) }, '+ New exercise'));
}

function addToDay(key, ex) {
  const entry = { id: uid(), exerciseId: ex.id, name: ex.name, image: ex.image || '', sets: [cloneSpec(ex.spec)] };
  if (ex.details) entry.details = ex.details;
  ensureDay(key).entries.push(entry);
  save();
  closeSheet();
  refreshDay(key);
  const blank = feedEl.querySelector(`[data-key="${key}"] .ex-wrap:last-child .val`);
  if (blank && !blank.value) blank.focus({ preventScroll: true });
}

// ---------- edit an entry on a specific day ----------
function openEntryEditor(key, id) {
  const day = getDay(key);
  if (!day) return;
  const idx = day.entries.findIndex((e) => e.id === id);
  if (idx < 0) return;
  const entry = day.entries[idx];
  const name = h('input', { value: entry.name, ...NO_CAPS });
  const sets = entry.sets.map(cloneSpec);
  const setsWrap = h('div', {});
  const drawSets = () => {
    setsWrap.replaceChildren(...sets.map((spec, i) => fieldDiv(sets.length > 1 ? `Set ${i + 1}` : 'Blocks', blockEditor(spec),
      sets.length > 1 ? h('button', { class: 'link', onclick: () => { sets.splice(i, 1); drawSets(); } }, 'Remove set') : null)));
  };
  drawSets();
  const done = () => { save(); closeSheet(); refreshDay(key); };
  const move = (delta) => {
    const j = idx + delta;
    if (j < 0 || j >= day.entries.length) return;
    [day.entries[idx], day.entries[j]] = [day.entries[j], day.entries[idx]];
    done();
  };
  openSheet('This day only',
    field('Name', name),
    setsWrap,
    h('button', { class: 'btn small', onclick: () => { sets.push(cloneSpec(sets[sets.length - 1] || [])); drawSets(); } }, '+ Add set'),
    h('button', { class: 'btn primary', onclick: () => {
      entry.name = name.value.trim() || entry.name;
      entry.sets = sets;
      done();
    } }, 'Save'),
    isDone(key, entry)
      ? h('button', { class: 'btn', onclick: () => { entry.done = false; done(); } }, 'Edit sets on the day')
      : h('button', { class: 'btn', onclick: () => { entry.done = true; done(); } }, 'Mark done'),
    h('div', { class: 'btn-row' },
      h('button', { class: 'btn', disabled: idx === 0, onclick: () => move(-1) }, 'Move up'),
      h('button', { class: 'btn', disabled: idx === day.entries.length - 1, onclick: () => move(1) }, 'Move down')),
    h('button', { class: 'btn danger', onclick: () => { day.entries.splice(idx, 1); cleanupDay(key); done(); } }, 'Remove from this day'));
}

// ---------- exercise library ----------
function shrinkPhoto(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const S = 128;
      const c = document.createElement('canvas');
      c.width = S; c.height = S;
      const side = Math.min(img.width, img.height);
      c.getContext('2d').drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, S, S);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', 0.8));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('bad image')); };
    img.src = url;
  });
}

function openExerciseForm(ex, afterSave) {
  const name = h('input', { value: ex ? ex.name : '', ...NO_CAPS });
  const spec = cloneSpec(ex && ex.spec);
  let image = ex ? ex.image || '' : '';
  const link = h('input', { type: 'url', inputmode: 'url', value: image.startsWith('data:') ? '' : image, ...NO_CAPS });
  const preview = h('div', { class: 'preview' });
  const drawPreview = () => {
    preview.textContent = '';
    if (isImage(image)) preview.append(icon({ name: name.value, image }, 'lg'), h('button', { class: 'link', onclick: () => { image = ''; link.value = ''; drawPreview(); } }, 'Remove picture'));
  };
  link.addEventListener('input', () => { image = link.value.trim(); drawPreview(); });
  const photo = h('input', { type: 'file', accept: 'image/*', hidden: true });
  photo.addEventListener('change', async () => {
    const f = photo.files[0];
    photo.value = '';
    if (!f) return;
    try { image = await shrinkPhoto(f); link.value = ''; drawPreview(); } catch (_) { alert('Could not read that picture.'); }
  });
  drawPreview();
  const saveBtn = h('button', { class: 'btn primary', disabled: !(ex && ex.name.trim()) }, 'Save');
  name.addEventListener('input', () => { saveBtn.disabled = !name.value.trim(); });
  saveBtn.addEventListener('click', () => {
    const data = { name: name.value.trim(), spec, image: isImage(image) ? image : '' };
    if (!data.name) return;
    if (ex) { Object.assign(ex, data); delete ex.details; } else state.exercises.push({ id: uid(), ...data });
    save();
    renderExercises();
    if (afterSave) afterSave(); else closeSheet();
  });
  openSheet(ex ? 'Edit exercise' : 'New exercise',
    field('Name', name),
    fieldDiv('Blocks', blockEditor(spec)),
    ex && ex.details ? h('p', { class: 'hint' }, `Old details: ${ex.details}`) : null,
    fieldDiv('Picture (optional)', h('div', {},
      h('label', { class: 'pill' }, 'Choose photo', photo),
      h('div', { class: 'or' }, 'or paste a link'),
      link)),
    preview,
    saveBtn,
    ex ? h('button', { class: 'btn danger', onclick: () => {
      if (!confirm(`Delete “${ex.name}”? Days you already logged keep it.`)) return;
      state.exercises = state.exercises.filter((x) => x.id !== ex.id);
      save();
      renderExercises();
      closeSheet();
    } }, 'Delete exercise') : null);
  if (!ex) setTimeout(() => name.focus(), 50);
}

function renderExercises() {
  const list = document.getElementById('exercise-list');
  list.textContent = '';
  for (const ex of sortedExercises()) {
    list.append(h('li', { onclick: () => openExerciseForm(ex) }, icon(ex, 'lg'), h('div', { class: 'grow' }, exerciseText(ex, '__'))));
  }
  document.getElementById('exercise-empty').hidden = state.exercises.length > 0;
}
document.getElementById('new-exercise-btn').addEventListener('click', () => openExerciseForm(null));

// ---------- profile ----------
function applyTheme() {
  const t = state.profile.theme;
  document.documentElement.style.setProperty('--accent', state.profile.accent);
  document.documentElement.style.setProperty('--pop', state.profile.pop);
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
}

function ageFrom(bday) {
  const b = dateOf(bday);
  const t = today();
  let a = t.getFullYear() - b.getFullYear();
  if (t.getMonth() < b.getMonth() || (t.getMonth() === b.getMonth() && t.getDate() < b.getDate())) a--;
  return a;
}

const num = (v) => { const n = parseFloat(String(v).replace(',', '.')); return Number.isFinite(n) ? n : null; };
const round1 = (n) => Math.round(n * 10) / 10;

function segmented(options, current, onPick) {
  return h('div', { class: 'seg' }, options.map(([v, label]) =>
    h('button', { class: v === current ? 'on' : '', onclick: () => onPick(v) }, label)));
}

function numInput(value, suffix, onInput) {
  const inp = h('input', { class: 'num', inputmode: 'decimal', value: value == null ? '' : String(value), 'aria-label': suffix, ...NO_CAPS });
  inp.addEventListener('input', () => onInput(inp.value));
  return h('span', { class: 'numwrap' }, inp, h('span', { class: 'suffix' }, suffix));
}

const PALETTES = [['Ocean', '#1e40af', '#f97316'], ['Navy & Red', '#1e3a8a', '#dc2626'], ['Ember', '#b91c1c', '#f59e0b'], ['Orange', '#ea580c', '#1d4ed8'], ['Forest', '#166534', '#f59e0b'], ['Grape', '#6d28d9', '#f43f5e']];
function colorPicker(p) {
  const swatches = PALETTES.map(([name, a, b]) => h('button', {
    class: `swatch${p.accent === a && p.pop === b ? ' on' : ''}`, 'aria-label': name, title: name,
    style: `background: linear-gradient(135deg, ${a} 50%, ${b} 50%)`,
    onclick: () => { p.accent = a; p.pop = b; save(); applyTheme(); renderProfile(); } }));
  const custom = (prop, label) => {
    const inp = h('input', { type: 'color', value: p[prop], 'aria-label': label });
    inp.addEventListener('input', () => { p[prop] = inp.value; save(); applyTheme(); });
    inp.addEventListener('change', renderProfile);
    return inp;
  };
  return h('div', { class: 'colors' }, h('div', { class: 'swatches' }, swatches),
    h('div', { class: 'pair' }, h('label', { class: 'cpick' }, custom('accent', 'Main color'), 'Main'),
      h('label', { class: 'cpick' }, custom('pop', 'Highlight color'), 'Highlight')));
}
function renderProfile() {
  const p = state.profile;
  const root = document.getElementById('profile');
  root.textContent = '';
  const metric = p.units === 'metric';

  const name = h('input', { value: p.name, 'aria-label': 'Name', ...NO_CAPS });
  name.addEventListener('input', () => { p.name = name.value; save(); });

  const age = h('span', { class: 'age' });
  const drawAge = () => { age.textContent = p.birthday ? `Age ${ageFrom(p.birthday)}` : ''; };
  const bday = h('input', { type: 'date', value: p.birthday, max: todayKey(), 'aria-label': 'Birthday' });
  bday.addEventListener('change', () => { p.birthday = bday.value; save(); drawAge(); });
  drawAge();

  let height;
  if (metric) {
    height = numInput(p.heightCm == null ? null : Math.round(p.heightCm), 'cm', (v) => { p.heightCm = num(v); save(); });
  } else {
    let ft = '';
    let inch = '';
    if (p.heightCm != null) {
      const total = Math.round(p.heightCm / 2.54);
      ft = Math.floor(total / 12); inch = total % 12;
    }
    const update = () => {
      const f = num(ft); const i = num(inch);
      p.heightCm = f == null && i == null ? null : ((f || 0) * 12 + (i || 0)) * 2.54;
      save();
    };
    height = h('span', { class: 'pair' },
      numInput(ft, 'ft', (v) => { ft = v; update(); }),
      numInput(inch, 'in', (v) => { inch = v; update(); }));
  }
  const weight = numInput(p.weightKg == null ? null : round1(metric ? p.weightKg : p.weightKg * 2.20462), metric ? 'kg' : 'lb',
    (v) => { const n = num(v); p.weightKg = n == null ? null : (metric ? n : n / 2.20462); save(); });

  const row = (label, control) => h('div', { class: 'prow' }, h('span', { class: 'plabel' }, label), h('div', { class: 'pctl' }, control));
  root.append(
    h('div', { class: 'group' }, h('h2', {}, 'You'), h('div', { class: 'group-card' },
      row('Name', name),
      row('Birthday', h('span', { class: 'pair' }, bday, age)),
      row('Height', height),
      row('Weight', weight))),
    h('div', { class: 'group' }, h('h2', {}, 'Settings'), h('div', { class: 'group-card' },
      row('Units', segmented([['imperial', 'lb · ft'], ['metric', 'kg · cm']], p.units, (v) => { p.units = v; save(); renderProfile(); })),
      row('Colors', colorPicker(p)),
      row('Appearance', segmented([['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark']], p.theme, (v) => { p.theme = v; save(); applyTheme(); renderProfile(); })))));
}

// ---------- backup ----------
document.getElementById('export-btn').addEventListener('click', async () => {
  const json = JSON.stringify(state, null, 1);
  const fileName = `workouts-backup-${todayKey()}.json`;
  const file = new File([json], fileName, { type: 'application/json' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: fileName }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  const a = h('a', { href: URL.createObjectURL(file), download: fileName });
  document.body.append(a);
  a.click();
  a.remove();
});

document.getElementById('import-input').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  try {
    const data = JSON.parse(await f.text());
    if (!data || typeof data.days !== 'object' || !Array.isArray(data.exercises)) throw new Error('bad file');
    if (!confirm('Replace everything in the app with this backup?')) return;
    state = normalize(data);
    save();
    applyTheme();
    initRange();
    renderFeed();
    renderExercises();
    renderProfile();
    alert('Backup restored.');
  } catch (_) {
    alert('That file is not a valid backup.');
  }
});

// ---------- tabs ----------
let logScroll = null;
function showView(name) {
  const wasLog = document.getElementById('view-log').classList.contains('active');
  if (wasLog && name !== 'log') logScroll = window.scrollY;
  document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.id === `view-${name}`));
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.view === name));
  if (name === 'log' && !wasLog && logScroll != null) window.scrollTo(0, logScroll);
  else if (name !== 'log') window.scrollTo(0, 0);
}
document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => showView(t.dataset.view)));

let lastTodayKey = todayKey();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || todayKey() === lastTodayKey) return;
  lastTodayKey = todayKey();
  initRange();
  renderFeed();
  scrollToToday(false);
});

// ---------- start ----------
applyTheme();
initRange();
renderFeed();
renderExercises();
renderProfile();
requestAnimationFrame(() => {
  scrollToToday(false);
  updateTitle();
  const watch = (id, fn) => new IntersectionObserver((items) => {
    if (items.some((i) => i.isIntersecting) && logActive()) fn();
  }, { rootMargin: '1200px 0px' }).observe(document.getElementById(id));
  watch('top-sentinel', extendPast);
  watch('bottom-sentinel', extendFuture);
});
if ('serviceWorker' in navigator) {
  const hadController = !!navigator.serviceWorker.controller;
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController && !reloaded) { reloaded = true; location.reload(); }
  });
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then((reg) => {
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
  }).catch(() => {});
}
