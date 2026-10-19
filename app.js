'use strict';

const STORE_KEY = 'workouts.v1';
const DEFAULT_PRESETS = ['Upper Day', 'Lower Day', 'Push Day', 'Pull Day', 'Leg Day', 'Mobility Day', 'Rest Day'];
const PAGE_DAYS = 60;
const NO_CAPS = { autocapitalize: 'none', autocorrect: 'off', spellcheck: 'false' };

// ---------- storage ----------
function load() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY));
    if (s) return { exercises: s.exercises || [], days: s.days || {}, presets: s.presets || DEFAULT_PRESETS.slice() };
  } catch (_) { /* fall through */ }
  return { exercises: [], days: {}, presets: DEFAULT_PRESETS.slice() };
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

// ---------- dom helper ----------
function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'value') el.value = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

const isImageUrl = (u) => /^https?:\/\/\S+$/i.test((u || '').trim());

function icon(item) {
  const letter = h('div', { class: 'ico letter' }, (item.name || '?').trim().charAt(0) || '?');
  if (!isImageUrl(item.image)) return letter;
  const img = h('img', { class: 'ico', src: item.image.trim(), alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' });
  img.addEventListener('error', () => img.replaceWith(letter));
  return img;
}

function exerciseText(item) {
  return h('div', { class: 'etext' },
    h('div', { class: 'ename' }, item.name),
    item.details ? h('div', { class: 'edetails' }, item.details) : null);
}

// ---------- day data ----------
function getDay(key) { return state.days[key]; }
function ensureDay(key) { return (state.days[key] ||= { name: '', entries: [] }); }
function cleanupDay(key) {
  const d = state.days[key];
  if (d && !d.name.trim() && d.entries.length === 0) delete state.days[key];
}

// ---------- calendar ----------
const daysEl = document.getElementById('days');
let rangeNewest = today();
let rangeOldest = addDays(today(), -PAGE_DAYS);
let lastMonthRendered = null;

function computeNewest() {
  let newest = today();
  for (const k of Object.keys(state.days)) {
    const d = dateOf(k);
    if (d > newest) newest = d;
  }
  return newest;
}

function renderDay(key) {
  const date = dateOf(key);
  const day = getDay(key);
  const isToday = key === keyOf(today());

  const nameInput = h('input', {
    class: 'dayname', value: day ? day.name : '', placeholder: 'name', enterkeyhint: 'done',
    'aria-label': 'Day name', ...NO_CAPS,
  });
  nameInput.addEventListener('input', () => {
    ensureDay(key).name = nameInput.value;
    cleanupDay(key);
    save();
  });
  nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') nameInput.blur(); });

  const entries = (day ? day.entries : []).map((entry) =>
    h('li', { class: 'entry', onclick: () => openEntryEditor(key, entry.id) }, icon(entry), exerciseText(entry)));

  return h('div', { class: `day${isToday ? ' today' : ''}`, 'data-key': key },
    h('div', { class: 'date' },
      h('span', { class: 'dow' }, date.toLocaleDateString(undefined, { weekday: 'short' })),
      h('span', { class: 'dnum' }, date.getDate())),
    h('div', { class: 'body' },
      h('div', { class: 'namerow' },
        nameInput,
        h('button', { class: 'icon-btn', 'aria-label': 'Pick a day name', onclick: () => openPresetPicker(key) }, '▾'),
        h('button', { class: 'icon-btn add', 'aria-label': 'Add exercise', onclick: () => openExercisePicker(key) }, '+')),
      entries.length ? h('ul', { class: 'entries' }, entries) : null));
}

function monthLabel(d) { return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }); }

function appendRange(fromNewest, toOldest) {
  const frag = document.createDocumentFragment();
  for (let d = fromNewest; d >= toOldest; d = addDays(d, -1)) {
    const m = `${d.getFullYear()}-${d.getMonth()}`;
    if (m !== lastMonthRendered) {
      frag.append(h('div', { class: 'month' }, monthLabel(d)));
      lastMonthRendered = m;
    }
    frag.append(renderDay(keyOf(d)));
  }
  daysEl.append(frag);
}

function renderCalendar() {
  daysEl.textContent = '';
  lastMonthRendered = null;
  appendRange(rangeNewest, rangeOldest);
}

function refreshDay(key) {
  const old = daysEl.querySelector(`.day[data-key="${key}"]`);
  if (old) old.replaceWith(renderDay(key));
}

function scrollToDay(key, smooth) {
  const el = daysEl.querySelector(`.day[data-key="${key}"]`);
  if (el) el.scrollIntoView({ block: 'start', behavior: smooth ? 'smooth' : 'auto' });
}

function jumpTo(key) {
  const d = dateOf(key);
  let full = false;
  if (d > rangeNewest) { rangeNewest = d; full = true; }
  if (d < rangeOldest) { rangeOldest = addDays(d, -7); full = true; }
  if (full) renderCalendar();
  showView('calendar');
  requestAnimationFrame(() => scrollToDay(key, true));
}

new IntersectionObserver((items) => {
  if (!items.some((i) => i.isIntersecting)) return;
  const nextNewest = addDays(rangeOldest, -1);
  rangeOldest = addDays(rangeOldest, -PAGE_DAYS);
  appendRange(nextNewest, rangeOldest);
}, { rootMargin: '600px' }).observe(document.getElementById('days-sentinel'));

document.getElementById('today-btn').addEventListener('click', () => {
  window.scrollTo({ top: 0, behavior: 'smooth' });
  if (rangeNewest > today()) jumpTo(keyOf(today()));
});
const jumpInput = document.getElementById('jump-input');
jumpInput.addEventListener('change', () => { if (jumpInput.value) jumpTo(jumpInput.value); });
jumpInput.addEventListener('focus', () => { if (!jumpInput.value) jumpInput.value = keyOf(today()); });

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

// ---------- day name presets ----------
function openPresetPicker(key) {
  const setName = (name) => {
    ensureDay(key).name = name;
    cleanupDay(key);
    save();
    refreshDay(key);
    closeSheet();
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
  const newInput = h('input', { 'aria-label': 'New day name', enterkeyhint: 'done', ...NO_CAPS });
  const addPreset = () => {
    const v = newInput.value.trim();
    if (!v) return;
    if (!state.presets.includes(v)) state.presets.push(v);
    save();
    newInput.value = '';
    draw();
  };
  newInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') addPreset(); });
  const day = getDay(key);
  openSheet('Day name',
    list,
    h('div', { class: 'add-preset' }, newInput, h('button', { onclick: addPreset }, 'Add')),
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
    const items = sortedExercises().filter((x) => !q || x.name.toLowerCase().includes(q));
    list.textContent = '';
    if (!state.exercises.length) list.append(h('p', { class: 'empty' }, 'No exercises yet.'));
    for (const ex of items) {
      list.append(h('div', { class: 'choice', onclick: () => addToDay(key, ex) }, icon(ex), h('div', { class: 'grow' }, exerciseText(ex))));
    }
  };
  search.addEventListener('input', draw);
  draw();
  const date = dateOf(key).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  openSheet(`Add to ${date}`,
    state.exercises.length > 6 ? search : '',
    list,
    h('button', { class: 'btn', onclick: () => openExerciseForm(null, () => openExercisePicker(key)) }, '+ New exercise'));
}

function addToDay(key, ex) {
  ensureDay(key).entries.push({ id: uid(), name: ex.name, details: ex.details || '', image: ex.image || '' });
  save();
  refreshDay(key);
  closeSheet();
}

// ---------- edit an entry on a specific day ----------
function openEntryEditor(key, id) {
  const day = getDay(key);
  if (!day) return;
  const idx = day.entries.findIndex((e) => e.id === id);
  if (idx < 0) return;
  const entry = day.entries[idx];
  const name = h('input', { value: entry.name, ...NO_CAPS });
  const details = h('textarea', { rows: 3, ...NO_CAPS });
  details.value = entry.details || '';
  const done = () => { save(); refreshDay(key); closeSheet(); };
  const move = (delta) => {
    const j = idx + delta;
    if (j < 0 || j >= day.entries.length) return;
    [day.entries[idx], day.entries[j]] = [day.entries[j], day.entries[idx]];
    done();
  };
  openSheet('This day only',
    field('Name', name),
    field('Details', details),
    h('button', { class: 'btn primary', onclick: () => {
      entry.name = name.value.trim() || entry.name;
      entry.details = details.value.trim();
      done();
    } }, 'Save'),
    h('div', { class: 'btn-row' },
      h('button', { class: 'btn', disabled: idx === 0, onclick: () => move(-1) }, 'Move up'),
      h('button', { class: 'btn', disabled: idx === day.entries.length - 1, onclick: () => move(1) }, 'Move down')),
    h('button', { class: 'btn danger', onclick: () => { day.entries.splice(idx, 1); cleanupDay(key); done(); } }, 'Remove from this day'));
}

// ---------- exercise library ----------
function openExerciseForm(ex, afterSave) {
  const name = h('input', { value: ex ? ex.name : '', ...NO_CAPS });
  const details = h('textarea', { rows: 3, ...NO_CAPS });
  details.value = ex ? ex.details || '' : '';
  const image = h('input', { type: 'url', inputmode: 'url', value: ex ? ex.image || '' : '', ...NO_CAPS });
  const preview = h('div', { class: 'preview' });
  const drawPreview = () => {
    preview.textContent = '';
    if (isImageUrl(image.value)) preview.append(icon({ name: name.value, image: image.value }), 'Icon preview');
  };
  image.addEventListener('input', drawPreview);
  drawPreview();
  const saveBtn = h('button', { class: 'btn primary', disabled: !(ex && ex.name.trim()) }, 'Save');
  name.addEventListener('input', () => { saveBtn.disabled = !name.value.trim(); });
  saveBtn.addEventListener('click', () => {
    const data = { name: name.value.trim(), details: details.value.trim(), image: image.value.trim() };
    if (!data.name) return;
    if (ex) Object.assign(ex, data);
    else state.exercises.push({ id: uid(), ...data });
    save();
    renderExercises();
    if (afterSave) afterSave(); else closeSheet();
  });
  openSheet(ex ? 'Edit exercise' : 'New exercise',
    field('Name', name),
    field('Details', details),
    field('Picture link (optional)', image),
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
    list.append(h('li', { onclick: () => openExerciseForm(ex) }, icon(ex), h('div', { class: 'grow' }, exerciseText(ex))));
  }
  document.getElementById('exercise-empty').hidden = state.exercises.length > 0;
}
document.getElementById('new-exercise-btn').addEventListener('click', () => openExerciseForm(null));

// ---------- backup ----------
document.getElementById('export-btn').addEventListener('click', async () => {
  const json = JSON.stringify(state, null, 1);
  const fileName = `workouts-backup-${keyOf(today())}.json`;
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
    state = { exercises: data.exercises, days: data.days, presets: data.presets || DEFAULT_PRESETS.slice() };
    save();
    rangeNewest = computeNewest();
    renderCalendar();
    renderExercises();
    alert('Backup restored.');
  } catch (_) {
    alert('That file is not a valid backup.');
  }
});

// ---------- tabs ----------
function showView(name) {
  document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.id === `view-${name}`));
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.view === name));
}
document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => { showView(t.dataset.view); window.scrollTo(0, 0); }));

// Re-render if the date rolls over while the app stays open.
let lastTodayKey = keyOf(today());
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || keyOf(today()) === lastTodayKey) return;
  lastTodayKey = keyOf(today());
  rangeNewest = computeNewest();
  renderCalendar();
});

// ---------- start ----------
rangeNewest = computeNewest();
renderCalendar();
renderExercises();
if (rangeNewest > today()) requestAnimationFrame(() => scrollToDay(keyOf(today())));
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
