'use strict';

const STORE_KEY = 'workouts.v1';
const DEFAULT_PRESETS = ['Upper Day', 'Lower Day', 'Push Day', 'Pull Day', 'Leg Day', 'Mobility Day', 'Rest Day'];
const DEFAULT_PROFILE = { name: '', birthday: '', units: 'imperial', heightCm: null, weightKg: null, theme: 'auto' };
const UNITS = ['sets', 'reps', 'lb', 'kg', 'sec', 'min', 'hr', 'mi', 'km', 'm', 'rounds', 'cal'];
const JOINS = ['×', 'at', 'for', '@', 'of', '+', '/', ''];
const PAGE_DAYS = 60;
const NO_CAPS = { autocapitalize: 'none', autocorrect: 'off', spellcheck: 'false' };

// ---------- storage ----------
function normalize(s) {
  return {
    exercises: Array.isArray(s.exercises) ? s.exercises : [],
    days: s.days && typeof s.days === 'object' ? s.days : {},
    presets: Array.isArray(s.presets) ? s.presets : DEFAULT_PRESETS.slice(),
    profile: { ...DEFAULT_PROFILE, ...(s.profile || {}) },
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

function selectBox(cls, options, current, onChange, label) {
  const opts = options.slice();
  if (current && !opts.includes(current)) opts.push(current);
  const sel = h('select', { class: cls, 'aria-label': label },
    opts.map((o) => h('option', { value: o }, o === '' ? '—' : o)));
  sel.value = current;
  const fit = () => { sel.style.width = `calc(${Math.max(1, (sel.value || '—').length)}ch + 30px)`; };
  fit();
  sel.addEventListener('change', () => { onChange(sel.value, sel); fit(); });
  return sel;
}

function unitSelect(block, onChange) {
  const sel = selectBox('unit', [...UNITS, 'other…'], block.unit, (v, s) => {
    if (v === 'other…') {
      const custom = (prompt('Unit name') || '').trim();
      if (!custom) { s.value = block.unit; return; }
      block.unit = custom;
      if (![...s.options].some((o) => o.value === custom)) s.insertBefore(h('option', { value: custom }, custom), s.lastChild);
      s.value = custom;
    } else block.unit = v;
    onChange();
  }, 'Unit');
  return sel;
}

function joinSelect(block, onChange) {
  return selectBox('join', JOINS, block.join, (v) => { block.join = v; onChange(); }, 'Joining word');
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

// ---------- log feed (oldest at top, newest at bottom) ----------
const feedEl = document.getElementById('feed');
const feedStart = document.getElementById('feed-start');
const expanded = new Set();
let rangeOldest;
let rangeNewest;

function loggedKeys() { return Object.keys(state.days).sort(); }
function pastFloor() {
  const ks = loggedKeys();
  return addDays(minDate(ks.length ? dateOf(ks[0]) : today(), today()), -PAGE_DAYS);
}
function initRange() {
  const ks = loggedKeys();
  rangeNewest = addDays(maxDate(ks.length ? dateOf(ks[ks.length - 1]) : today(), today()), 14);
  rangeOldest = maxDate(pastFloor(), addDays(today(), -PAGE_DAYS));
}

const fmt = (d, o) => d.toLocaleDateString(undefined, o);
function monthLabel(d) { return fmt(d, { month: 'long', year: 'numeric' }); }

function renderCard(key) {
  const date = dateOf(key);
  const day = getDay(key);
  const isToday = key === todayKey();
  const nameInput = h('input', { class: 'dayname', value: day ? day.name : '', enterkeyhint: 'done', 'aria-label': 'Day name', ...NO_CAPS });
  nameInput.addEventListener('input', () => { ensureDay(key).name = nameInput.value; save(); });
  nameInput.addEventListener('blur', () => { cleanupDay(key); save(); });
  nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') nameInput.blur(); });

  const entries = (day ? day.entries : []).map((entry) => {
    entry.spec ||= [];
    return h('li', { class: 'entry' },
      icon(entry, 'lg'),
      h('div', { class: 'etext' },
        h('button', { class: 'ename', onclick: () => openEntryEditor(key, entry.id) }, entry.name),
        entry.spec.length ? specInline(entry.spec, save) : null,
        entry.details ? h('div', { class: 'edetails' }, entry.details) : null));
  });

  return h('article', { class: `card${isToday ? ' today' : ''}`, 'data-anchor': key, 'data-key': key },
    h('header', { class: 'card-head' },
      h('div', { class: 'cdate' },
        h('span', { class: 'dow' }, isToday ? 'Today' : fmt(date, { weekday: 'short' })),
        h('span', { class: 'dnum' }, date.getDate())),
      nameInput,
      h('button', { class: 'chip', 'aria-label': 'Pick a day name', onclick: () => openPresetPicker(key) }, '▾')),
    entries.length ? h('ul', { class: 'entries' }, entries) : null,
    h('button', { class: 'add-ex', onclick: () => openExercisePicker(key) }, '+ Add exercise'));
}

function renderRow(key) {
  return h('div', { class: 'erow', 'data-anchor': key, 'data-key': key },
    h('span', { class: 'erow-date' }, fmt(dateOf(key), { weekday: 'short', month: 'short', day: 'numeric' })),
    h('button', { class: 'chip', 'aria-label': 'Name this day', onclick: () => openPresetPicker(key) }, '▾'),
    h('button', { class: 'chip add', 'aria-label': 'Add exercise', onclick: () => openExercisePicker(key) }, '+'));
}

function renderGap(from, to) {
  const n = Math.round((to - from) / 864e5) + 1;
  const label = n === 1 ? fmt(from, { weekday: 'short', month: 'short', day: 'numeric' })
    : `${fmt(from, { month: 'short', day: 'numeric' })} – ${to.getDate()}`;
  const note = from > today() ? 'nothing planned' : 'nothing logged';
  return h('button', { class: 'gap', 'data-anchor': keyOf(from), onclick: () => {
    for (let d = from; d <= to; d = addDays(d, 1)) expanded.add(keyOf(d));
    refreshFeed();
  } }, h('span', { class: 'gap-dates' }, label), h('span', { class: 'gap-note' }, n === 1 ? note : `${n} days · ${note}`));
}

function renderFeed() {
  const frag = document.createDocumentFragment();
  const tk = todayKey();
  let month = null;
  let gap = null;
  const flush = () => { if (gap) { frag.append(renderGap(gap.from, gap.to)); gap = null; } };
  for (let d = rangeOldest; d <= rangeNewest; d = addDays(d, 1)) {
    const m = d.getFullYear() * 12 + d.getMonth();
    if (m !== month) { flush(); frag.append(h('div', { class: 'month' }, monthLabel(d))); month = m; }
    const key = keyOf(d);
    if (getDay(key) || key === tk) { flush(); frag.append(renderCard(key)); }
    else if (expanded.has(key)) { flush(); frag.append(renderRow(key)); }
    else if (gap) gap.to = d;
    else gap = { from: d, to: d };
  }
  flush();
  frag.append(h('button', { class: 'more', onclick: () => { rangeNewest = addDays(rangeNewest, 30); refreshFeed(); } }, 'Show more days ahead'));
  feedEl.replaceChildren(frag);
  feedStart.hidden = rangeOldest > pastFloor();
}

const topInset = () => document.querySelector('#view-log .topbar').getBoundingClientRect().bottom;
const bottomInset = () => document.querySelector('.tabbar').getBoundingClientRect().top;

// Re-render while keeping whatever is on screen in the same place.
function refreshFeed() {
  const top = topInset();
  let anchor = null;
  let offset = 0;
  for (const el of feedEl.querySelectorAll('[data-anchor]')) {
    const r = el.getBoundingClientRect();
    if (r.bottom > top) { anchor = el.dataset.anchor; offset = r.top; break; }
  }
  renderFeed();
  const el = anchor && feedEl.querySelector(`[data-anchor="${anchor}"]`);
  if (el) window.scrollBy(0, el.getBoundingClientRect().top - offset);
}

function scrollToKey(key, smooth, alignEnd) {
  const el = feedEl.querySelector(`[data-key="${key}"]`);
  if (!el) return;
  const top = topInset() + 36;
  const bottom = bottomInset() - 12;
  const r = el.getBoundingClientRect();
  const delta = alignEnd && r.height <= bottom - top ? r.bottom - bottom : r.top - top;
  window.scrollBy({ top: delta, behavior: smooth ? 'smooth' : 'auto' });
}
const scrollToToday = (smooth) => scrollToKey(todayKey(), smooth, true);

function jumpTo(key) {
  const d = dateOf(key);
  if (d < rangeOldest) rangeOldest = addDays(d, -7);
  if (d > rangeNewest) rangeNewest = addDays(d, 14);
  expanded.add(key);
  renderFeed();
  showView('log');
  requestAnimationFrame(() => scrollToKey(key, true, false));
}

const topSentinel = document.getElementById('top-sentinel');
function extendPast() {
  const floor = pastFloor();
  if (rangeOldest <= floor) return;
  rangeOldest = maxDate(floor, addDays(rangeOldest, -PAGE_DAYS));
  refreshFeed();
  requestAnimationFrame(() => {
    if (document.getElementById('view-log').classList.contains('active') && topSentinel.getBoundingClientRect().bottom > -800) extendPast();
  });
}

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
function openPresetPicker(key) {
  const setName = (name) => {
    ensureDay(key).name = name;
    cleanupDay(key);
    save();
    closeSheet();
    refreshFeed();
  };
  const list = h('div', {});
  const draw = () => {
    list.textContent = '';
    state.presets.forEach((p, i) => {
      list.append(h('div', { class: 'choice' },
        h('div', { class: 'grow', onclick: () => setName(p) }, p),
        h('button', { class: 'x', 'aria-label': `Remove ${p}`, onclick: () => { state.presets.splice(i, 1); save(); draw(); } }, '×')));
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
    day && day.name ? h('button', { class: 'btn danger', onclick: () => setName('') }, 'Clear name') : null);
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
  const entry = { id: uid(), exerciseId: ex.id, name: ex.name, image: ex.image || '', spec: cloneSpec(ex.spec) };
  if (ex.details) entry.details = ex.details;
  ensureDay(key).entries.push(entry);
  expanded.add(key);
  save();
  closeSheet();
  refreshFeed();
  const blank = feedEl.querySelector(`[data-key="${key}"] .entry:last-child .val`);
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
  const spec = cloneSpec(entry.spec);
  const done = () => { save(); closeSheet(); refreshFeed(); };
  const move = (delta) => {
    const j = idx + delta;
    if (j < 0 || j >= day.entries.length) return;
    [day.entries[idx], day.entries[j]] = [day.entries[j], day.entries[idx]];
    done();
  };
  openSheet('This day only',
    field('Name', name),
    fieldDiv('Blocks', blockEditor(spec)),
    h('button', { class: 'btn primary', onclick: () => {
      entry.name = name.value.trim() || entry.name;
      entry.spec = spec;
      done();
    } }, 'Save'),
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
  new IntersectionObserver((items) => {
    if (items.some((i) => i.isIntersecting) && document.getElementById('view-log').classList.contains('active')) extendPast();
  }, { rootMargin: '800px 0px 0px 0px' }).observe(topSentinel);
});
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
