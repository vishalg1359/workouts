'use strict';

const STORE_KEY = 'workouts.v1';
const DEFAULT_PRESETS = ['Upper Day', 'Lower Day', 'Push Day', 'Pull Day', 'Leg Day', 'Mobility Day'];
const DEFAULT_PRESET_COLORS = { 'upper day': '#2563eb', 'lower day': '#16a34a', 'push day': '#dc2626', 'pull day': '#7c3aed', 'leg day': '#d97706', 'mobility day': '#0d9488' };
const DEFAULT_PROFILE = { name: '', birthday: '', units: 'imperial', heightCm: null, weightKg: null, theme: 'auto', accent: '#1e40af' };
const UNITS = ['sets', 'reps', 'lb', 'kg', 'sec', 'min', 'hr', 'mi', 'km', 'm', 'rounds', 'cal'];
const JOINS = ['×', 'at', 'for', 'in', '@', 'of', '+', '−', '/'];
const PREFIX_UNITS = new Set(['level']);
const SIGNS = { '+': '−', '−': '+' };

// Starter library: [name, icon, spec]. Spec blocks are 'join|unit'; W = the profile weight unit. Order = popularity.
const STARTERS = [
  ['bench press', 'bench', 'L'], ['squats', 'squat', 'L'], ['deadlift', 'deadlift', 'L'], ['pull-ups', 'pullup', 'B'],
  ['dumbbell bench press', 'db-bench', 'L'], ['machine chest press', 'chest-press', 'L'], ['incline bench press', 'incline', 'L'], ['overhead press', 'ohp', 'L'],
  ['barbell rows', 'bb-row', 'L'], ['lat pulldown', 'pulldown', 'L'], ['cable rows', 'cable-row', 'L'], ['bicep curls', 'curl', 'L'],
  ['tricep pushdowns', 'pushdown', 'L'], ['leg press', 'legpress', 'L'], ['romanian deadlift', 'rdl', 'L'], ['lunges', 'lunge', 'L'],
  ['push-ups', 'pushup', 'R'], ['plank', 'plank', 'T'], ['treadmill', 'treadmill', ['|mph', 'for|min', 'at|% incline']],
  ['incline dumbbell press', 'db-incline', 'L'], ['dumbbell rows', 'db-row', 'L'], ['dumbbell shoulder press', 'db-ohp', 'L'],
  ['lateral raises', 'lateral', 'L'], ['goblet squats', 'goblet', 'L'], ['hammer curls', 'curl', 'L'], ['tricep extensions', 'tricep', 'L'],
  ['leg extensions', 'legext', 'L'], ['leg curls', 'legcurl', 'L'], ['hip thrusts', 'hipthrust', 'L'], ['calf raises', 'calf', 'L'],
  ['dips', 'dip', 'B'], ['chin-ups', 'pullup', 'B'], ['stairmaster', 'stairs', ['|level', 'for|min']],
  ['stationary bike', 'bike', ['|level', 'for|min']], ['rowing machine', 'rower', ['|m', 'in|min']], ['elliptical', 'elliptical', ['|level', 'for|min']],
  ['running', 'run', ['|mi', 'in|min']], ['walking', 'walk', ['|mi', 'in|min']], ['cable fly', 'fly', 'L'], ['face pulls', 'face-pull', 'L'],
  ['shrugs', 'shrug', 'L'], ['bulgarian split squats', 'split', 'L'], ['front squats', 'squat', 'L'], ['kettlebell swings', 'kb-swing', 'L'], ['turkish get-ups', 'tgu', 'L'],
  ['crunches', 'crunch', 'R'], ['hanging leg raises', 'legraise', 'R'], ['russian twists', 'twist', 'R'], ['jump rope', 'rope', ['|min']],
  ['swimming', 'swim', ['|m', 'in|min']], ['stretching', 'stretch', 'T'],
  ['hamstring stretch', 'hamstring', 'T'], ['hip flexor stretch', 'st-hipflexor', 'T'], ['quad stretch', 'st-quad', 'T'], ['calf stretch', 'st-calf', 'T'], ['glute stretch', 'st-glute', 'T'], ['groin stretch', 'st-groin', 'T'], ['lower back stretch', 'st-lowerback', 'T'], ['chest stretch', 'st-chest', 'T'], ['shoulder stretch', 'st-shoulder', 'T'], ['tricep stretch', 'st-tricep', 'T'], ['lat stretch', 'st-lat', 'T'], ['neck stretch', 'st-neck', 'T'],
];
const SPEC_SHAPES = { L: ['|sets', '×|reps', 'at|W'], B: ['|sets', '×|reps', '+|W'], R: ['|sets', '×|reps'], T: ['|sets', 'for|sec'] };
const STARTER_RANK = new Map(STARTERS.map(([n], i) => [n, i]));
const iconPath = (file) => `icons/${file.includes('.') ? file : `${file}.svg`}`;
const OTHER = '\u0000other';
const EDIT = '\u0000edit';
const PAGE_DAYS = 60;
const NO_CAPS = { autocapitalize: 'none', autocorrect: 'off', spellcheck: 'false' };

// ---------- storage ----------
const fixIcon = (o) => { if (o && o.icon === 'icons/bench.png') o.icon = 'icons/bench.svg'; return o; };
function migrateDays(days) {
  Object.values(days).forEach((day) => (day.entries || []).forEach((e) => {
    fixIcon(e);
    if (!Array.isArray(e.sets)) e.sets = [Array.isArray(e.spec) ? e.spec : []];
    delete e.spec;
  }));
  return days;
}
function normalize(s) {
  return {
    exercises: Array.isArray(s.exercises) ? s.exercises.map(fixIcon) : [],
    days: s.days && typeof s.days === 'object' ? migrateDays(s.days) : {},
    presets: (Array.isArray(s.presets) ? s.presets : DEFAULT_PRESETS.slice()).filter((p) => !/^rest\b/i.test(p)),
    presetColors: s.presetColors && typeof s.presetColors === 'object' ? s.presetColors : { ...DEFAULT_PRESET_COLORS },
    profile: { ...DEFAULT_PROFILE, ...(s.profile || {}) },
    units: Array.isArray(s.units) ? s.units : UNITS.slice(),
    joins: Array.isArray(s.joins) ? s.joins.filter(Boolean) : JOINS.slice(),
    seed: s.seed || 0,
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

// Adds the starter library once. Existing exercises with the same name keep their data and just gain the icon.
function seedStarters() {
  if (state.seed < 1) seedV1();
  if (state.seed < 3) {
    if (state.seed >= 1 && !state.exercises.some((e) => e.name.trim().toLowerCase() === 'machine chest press')) {
      state.exercises.push({ id: uid(), name: 'machine chest press', image: '', icon: iconPath('chest-press'),
        spec: [{ join: '', value: '', unit: 'sets' }, { join: '×', value: '', unit: 'reps' }, { join: 'at', value: '', unit: weightUnit() }] });
    }
  }
  if (state.seed < 2) {
    const isBench = (o) => o.name.trim().toLowerCase() === 'bench press';
    const ids = new Set();
    for (const ex of state.exercises) if (isBench(ex)) { ex.image = ''; ex.icon = 'icons/bench.svg'; ids.add(ex.id); }
    for (const d of Object.values(state.days)) for (const e of d.entries) if (ids.has(e.exerciseId) || isBench(e)) { e.image = ''; e.icon = 'icons/bench.svg'; }
    state.seed = 2;
  }
  if (state.seed < 3) { state.seed = 3; save(); }
  if (state.seed < 4) {
    if (!state.exercises.some((e) => e.name.trim().toLowerCase() === 'turkish get-ups')) {
      state.exercises.push({ id: uid(), name: 'turkish get-ups', image: '', icon: iconPath('tgu'),
        spec: [{ join: '', value: '', unit: 'sets' }, { join: '×', value: '', unit: 'reps' }, { join: 'at', value: '', unit: weightUnit() }] });
    }
    state.seed = 4; save();
  }
  if (state.seed < 5) {
    const tSpec = () => [{ join: '', value: '', unit: 'sets' }, { join: 'for', value: '', unit: 'sec' }];
    const have = new Set(state.exercises.map((e) => e.name.trim().toLowerCase()));
    for (const ex of state.exercises) {
      if (ex.name.trim().toLowerCase() === 'stretching' && ex.spec && ex.spec.length === 1 && ex.spec[0].unit === 'min') ex.spec = tSpec();
    }
    for (const [name, file, shape] of STARTERS) {
      if (shape === 'T' && /stretch/.test(name) && !have.has(name)) state.exercises.push({ id: uid(), name, image: '', icon: iconPath(file), spec: tSpec() });
    }
    state.seed = 5; save();
  }
  if (state.seed < 6) {
    const files = new Map(STARTERS.filter(([n]) => /stretch/.test(n)).map(([n, f]) => [n, iconPath(f)]));
    for (const ex of state.exercises) {
      const f = files.get(ex.name.trim().toLowerCase());
      if (f && !ex.image && (!ex.icon || ex.icon === iconPath('stretch'))) ex.icon = f;
    }
    const byId = new Map(state.exercises.map((e) => [e.id, e]));
    for (const d of Object.values(state.days)) for (const en of d.entries || []) {
      const ex = byId.get(en.exerciseId);
      if (ex && !en.image && en.icon === iconPath('stretch')) en.icon = ex.icon;
    }
    state.seed = 6; save();
  }
}
function seedV1() {
  const w = weightUnit();
  const byName = new Map(state.exercises.map((e) => [e.name.trim().toLowerCase(), e]));
  for (const [name, file, shape] of STARTERS) {
    const have = byName.get(name);
    if (have) { if (!have.icon && !have.image) have.icon = iconPath(file); continue; }
    const spec = (typeof shape === 'string' ? SPEC_SHAPES[shape] : shape).map((b, i) => {
      const [join, unit] = b.split('|');
      return { join: i ? join : '', value: '', unit: unit === 'W' ? w : unit };
    });
    state.exercises.push({ id: uid(), name, spec, image: '', icon: iconPath(file) });
  }
  for (const u of ['level', 'mph', '% incline']) if (!state.units.includes(u)) state.units.push(u);
  for (const j of ['in', '−']) if (!state.joins.includes(j)) state.joins.push(j);
  state.seed = 1;
}
function save() { localStorage.setItem(STORE_KEY, JSON.stringify(state)); markDirty(); }

// GitHub backup settings live in their own key so exports never contain the access key.
const CLOUD_KEY = 'workouts.cloud';
const cloud = Object.assign({ token: '', repo: '', path: 'workouts.json', sha: '', lastAt: 0, dirty: false, error: '' },
  (() => { try { return JSON.parse(localStorage.getItem(CLOUD_KEY)) || {}; } catch (_) { return {}; } })());
const saveCloud = () => localStorage.setItem(CLOUD_KEY, JSON.stringify(cloud));
let backupTimer = null;
let backupBusy = false;
let editSeq = 0;
function markDirty() {
  editSeq++;
  if (!cloud.token) return;
  if (!cloud.dirty) { cloud.dirty = true; saveCloud(); }
  clearTimeout(backupTimer);
  backupTimer = setTimeout(() => backupNow(), 60000);
}
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
  for (const c of children.flat(Infinity)) {
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
  if (!isImage(item.image)) {
    return item.icon ? h('div', { class: `${cls} glyph` }, h('span', { style: `--m: url(${item.icon})` })) : letter;
  }
  const img = h('img', { class: cls, src: item.image.trim(), alt: '', referrerpolicy: 'no-referrer' });
  img.addEventListener('error', () => img.replaceWith(letter));
  return img;
}

// ---------- spec blocks ----------
// A spec is a list of blocks: { join, value, unit }. e.g. [ {'',3,'sets'}, {'×','','reps'}, {'at','','lb'} ]
const cloneSpec = (spec) => (spec || []).map((b) => ({ join: b.join || '', value: b.value || '', unit: b.unit || '' }));
const blankSpec = (spec) => cloneSpec(spec).map((b) => ({ ...b, value: '' }));
const weightUnit = () => (state.profile.units === 'metric' ? 'kg' : 'lb');

function specSummary(spec, blankMark) {
  return (spec || []).map((b, i) => {
    const parts = [];
    if (i > 0 && b.join) parts.push(b.join);
    const v = String(b.value || '').trim();
    const pre = PREFIX_UNITS.has(b.unit);
    if (pre) parts.push(b.unit);
    if (v || blankMark) parts.push(v || blankMark);
    if (b.unit && !pre) parts.push(b.unit);
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
  sel.replaceChildren(...opts.map((o) => h('option', { value: o }, o === '' ? 'none' : o)),
    h('option', { value: OTHER }, 'other…'), h('option', { value: EDIT }, 'edit list…'));
  sel.value = current;
  sel.style.width = `calc(${Math.max(1, (current || 'none').length)}ch + 12px)`;
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
  sheetGestures(box, body, back, close);
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
  inp.addEventListener('focus', () => setTimeout(() => inp.select(), 0));
  return inp;
}

// Inline blocks on a logged entry: fill in numbers, switch units.
function specInline(spec, onChange) {
  return h('div', { class: 'spec' }, spec.map((b, i) => [
    i > 0 && b.join ? (SIGNS[b.join]
      ? h('button', { class: 'jw sign', 'aria-label': 'Switch plus / minus', onclick: (e) => { b.join = SIGNS[b.join]; e.currentTarget.textContent = b.join; onChange(); } }, b.join)
      : h('span', { class: 'jw' }, b.join)) : null,
    h('span', { class: 'tile' },
      PREFIX_UNITS.has(b.unit) ? h('span', { class: 'ulabel pre' }, b.unit) : null,
      numField(b, onChange),
      !PREFIX_UNITS.has(b.unit) && b.unit ? h('span', { class: 'ulabel' }, b.unit) : null)]));
}

// Block builder used in the exercise form and entry editor.
function specTags(spec) {
  return (spec || []).filter((b) => b.unit || String(b.value || '').trim()).map((b, i) => {
    const v = String(b.value || '').trim();
    return [i > 0 && b.join ? h('span', { class: 'tag-join' }, b.join) : null,
      h('span', { class: 'tag' }, (PREFIX_UNITS.has(b.unit) ? [b.unit, v] : [v, b.unit]).filter(Boolean).join(' '))];
  });
}
function blockEditor(spec) {
  const wrap = h('div', { class: 'blocks' });
  const preview = h('div', { class: 'tags bpreview' });
  const drawPreview = () => preview.replaceChildren(...specTags(spec).flat().filter(Boolean));
  const draw = () => {
    wrap.textContent = '';
    drawPreview();
    if (spec.length) wrap.append(preview);
    spec.forEach((b, i) => {
      if (i > 0) wrap.append(h('div', { class: 'bconn' }, joinSelect(b, drawPreview)));
      const def = valueInput(b, drawPreview);
      def.classList.add('bdef-in');
      wrap.append(h('div', { class: 'bcard' },
        unitSelect(b, drawPreview),
        h('label', { class: 'bdef' }, h('span', {}, 'default'), def),
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

function exerciseText(item) {
  const tags = specTags(item.spec);
  return h('div', { class: 'etext' },
    h('div', { class: 'ename' }, item.name),
    tags.length ? h('div', { class: 'tags' }, tags) : null,
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
// A past day with nothing logged is a rest day, whatever it was named.
function isRestDay(key, day) {
  if (day && day.entries.length) return false;
  if (key < todayKey()) return true;
  return !!(day && /\brest\b/i.test(day.name));
}
const dayColor = (day) => (day && day.name ? state.presetColors[day.name.trim().toLowerCase()] : '') || '';

function monthHeader(d) {
  return h('div', { class: 'mhead', 'data-anchor': `m${keyOf(d)}`, 'data-month': keyOf(d) },
    h('span', { class: 'mname' }, fmt(d, { month: 'long' })),
    h('span', { class: 'myear' }, d.getFullYear()));
}


const isDone = (key, entry) => (entry.done == null ? key < todayKey() : entry.done);

function doneSummary(spec) {
  return spec.filter((b) => String(b.value || '').trim())
    .map((b, i) => [i > 0 ? b.join : '', ...(PREFIX_UNITS.has(b.unit) ? [b.unit, String(b.value).trim()] : [String(b.value).trim(), b.unit])].filter(Boolean).join(' '))
    .join(' ');
}

// Tapping an exercise's icon opens its history.
function entryIcon(entry) {
  const ic = icon(entry, 'sm');
  ic.addEventListener('click', (e) => {
    e.stopPropagation();
    const ex = state.exercises.find((x) => x.id === entry.exerciseId) || { id: entry.exerciseId, name: entry.name, spec: [] };
    openHistory(ex);
  });
  return ic;
}
// Only today is editable in the feed; tap any other day to edit it in a sheet.
const isPast = (key) => key < todayKey();
const isLocked = (key) => key !== todayKey();
function renderReadOnlyEntry(entry) {
  return h('div', { class: 'ex-wrap' }, h('div', { class: 'ex done' },
    h('div', { class: 'ex-head' }, entryIcon(entry), h('span', { class: 'ename' }, entry.name)),
    h('div', { class: 'sets' }, entry.sets.map(doneSummary).filter(Boolean).map((t) => h('div', { class: 'set-text' }, t))),
    entry.details ? h('div', { class: 'edetails' }, entry.details) : null));
}
function renderEntry(key, entry, editable) {
  if (!editable) return renderReadOnlyEntry(entry);
  const done = isDone(key, entry);
  const head = h('div', { class: 'ex-head' },
    entryIcon(entry),
    h('button', { class: 'ename', onclick: () => openEntryEditor(key, entry.id) }, entry.name));
  const rows = done
    ? entry.sets.map(doneSummary).filter(Boolean).map((t) => h('button', { class: 'set-text', onclick: () => openEntryEditor(key, entry.id) }, t))
    : entry.sets.map((spec, i) => h('div', { class: 'set' },
        entry.sets.length > 1 ? h('span', { class: 'sn' }, String(i + 1)) : null,
        specInline(spec, save),
        entry.sets.length > 1 ? h('button', { class: 'x', 'aria-label': 'Remove set',
          onclick: () => { entry.sets.splice(i, 1); save(); refreshDay(key); } }, '×') : null));
  const exEl = h('div', { class: `ex${done ? ' done' : ''}` }, head,
    h('div', { class: 'sets' }, rows,
      !done && !entry.sets.some((st) => st.length) ? h('div', { class: 'ex-actions' },
        h('button', { class: 'add-set', onclick: () => {
          const last = entry.sets[entry.sets.length - 1] || [];
          entry.sets.push(blankSpec(last));
          save();
          refreshDay(key);
        } }, '+ Row'),
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
  const wrap = h('div', { class: 'ex-wrap', 'data-eid': entry.id },
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

function renderDay(key, editable = false) {
  const date = dateOf(key);
  const day = getDay(key);
  const isToday = key === todayKey();
  const entries = day ? day.entries : [];
  const label = fmt(date, { weekday: 'short', month: 'short', day: 'numeric' });
  const rest = isRestDay(key, day);
  const color = rest ? '' : dayColor(day);
  const past = isPast(key);
  const locked = !editable;
  const named = day && day.name.trim();
  const folded = locked && (past || isToday) && entries.length > 0;
  const open = folded && expandedDays.has(key);
  const head = locked
    ? h('div', { class: 'dhead' },
        h('span', { class: 'ddate' }, label),
        isToday ? h('span', { class: 'tpill' }, 'Today') : null,
        named && !folded && !past ? h('span', { class: 'dayname static' }, day.name) : null)
    : h('div', { class: 'dhead' },
        h('span', { class: 'ddate' }, label),
        dayTypeButton(key, day));
  const toggle = () => { if (open) expandedDays.delete(key); else expandedDays.add(key); refreshDay(key); };
  return h('div', { class: `day${isToday ? ' today' : ''}${past ? ' past' : ''}${!past && !isToday ? ' future' : ''}${rest ? ' rest' : ''}${entries.length ? ' has' : ''}${color ? ' tinted' : ''}${folded ? ' folded' : ''}${open ? ' open' : ''}`,
    style: color ? `--day:${color}` : null, 'data-anchor': key, 'data-key': key, onclick: folded ? toggle : locked ? () => openDaySheet(key) : null },
    head,
    past && !entries.length ? h('div', { class: 'empty-slot' }, h('span', {}, '☾ rest day')) : null,
    isToday && locked && !entries.length ? h('div', { class: 'empty-slot today-slot' }, h('span', {}, 'nothing logged yet')) : null,
    folded ? h('div', { class: 'wbar' },
      h('span', { class: 'wtype' }, named ? day.name : 'Workout'),
      h('span', { class: 'wlist' }, open ? `${entries.length} exercise${entries.length > 1 ? 's' : ''}` : entries.map((e) => e.name).join(', ')),
      h('span', { class: 'wcaret' }, open ? '▴' : '▾')) : null,
    entries.length && (!folded || open) ? h('div', { class: 'exs' }, entries.map((e) => {
      const w = renderEntry(key, e, editable);
      return w;
    })) : null,
    open ? h('button', { class: 'edit-day', onclick: (e) => { e.stopPropagation(); openDaySheet(key); } }, 'Edit day') : null,
    locked ? null : h('button', { class: 'add-ex', onclick: () => openExercisePicker(key) }, '+ Add exercise'));
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
// Remember which day sits at the top of the screen (works even under an open sheet) and put it back there.
function captureAnchor() {
  if (!logActive()) return null;
  const top = topInset();
  for (const el of feedEl.querySelectorAll('[data-anchor]')) {
    const r = el.getBoundingClientRect();
    if (r.bottom > top) return { key: el.dataset.anchor, offset: r.top };
  }
  return null;
}
function restoreAnchor(a) {
  const el = a && feedEl.querySelector(`[data-anchor="${a.key}"]`);
  if (el) window.scrollBy(0, el.getBoundingClientRect().top - a.offset);
}
function keepAnchor(fn) {
  const a = captureAnchor();
  fn();
  restoreAnchor(a);
}

function dayTypeButton(key, day) {
  const named = day && day.name.trim();
  const rest = !named && !(day && day.entries.length);
  return h('button', { class: `daytype${named ? '' : rest ? ' empty rest' : ' empty'}`, 'aria-label': 'Pick a day type',
    onclick: (e) => { e.stopPropagation(); openPresetPicker(key); } },
    h('span', { class: 'dtname' }, named ? day.name : rest ? '☾ Rest day' : 'Day type'), h('span', { class: 'caret' }, '▾'));
}
// Past workout days start collapsed each time the app opens; tapping one expands it in place.
const expandedDays = new Set();
function openDaySheet(key) {
  const day = getDay(key);
  const entries = day ? day.entries : [];
  openSheet(fmt(dateOf(key), { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' }),
    fieldDiv('Day type', dayTypeButton(key, day)),
    entries.length ? h('div', {}, entries.map((e) => h('div', { class: 'choice', onclick: () => openEntryEditor(key, e.id) },
      icon(e), h('div', { class: 'grow' }, h('div', { class: 'cname' }, e.name),
        e.sets.map(doneSummary).filter(Boolean).map((t) => h('div', { class: 'set-text' }, t)))))) : h('p', { class: 'hint' }, 'Nothing logged.'),
    h('button', { class: 'btn primary', onclick: () => openExercisePicker(key) }, '+ Add exercise'));
}
// After editing something on a past day, go back to that day's sheet instead of closing.
const afterDayEdit = (key) => { save(); refreshDay(key); if (todayTabActive() && key === dayViewKey()) closeSheet(); else openDaySheet(key); };
function refreshDay(key) {
  keepAnchor(() => {
    const old = feedEl.querySelector(`[data-key="${key}"]`);
    if (old) old.replaceWith(renderDay(key));
  });
  if (key === dayViewKey()) renderToday();
  if (calMode === 'grid') renderMonthGrid();
  if (padField && !padField.isConnected) closePad();
}

// ---------- Today tab: today's workout (editable) and the last day of the same type ----------
let lastDayOpen = false;
function pastDaysDesc(before) {
  return Object.keys(state.days).filter((k) => k < before).sort().reverse();
}
function lastDayBar(key) {
  const name = ((getDay(key) || {}).name || '').trim();
  if (!name || /\brest\b/i.test(name)) return null;
  const k = pastDaysDesc(key).find((x) => state.days[x].entries.length && state.days[x].name.trim().toLowerCase() === name.toLowerCase());
  if (!k) return null;
  const d = state.days[k];
  const color = dayColor(d);
  return h('div', { class: `lastday${lastDayOpen ? ' open' : ''}`, style: color ? `--day:${color}` : null },
    h('button', { class: 'wbar', onclick: () => { lastDayOpen = !lastDayOpen; renderToday(); } },
      h('span', { class: 'wtype' }, `Last ${d.name}`),
      h('span', { class: 'wlist' }, fmt(dateOf(k), { weekday: 'short', month: 'short', day: 'numeric' })),
      h('span', { class: 'wcaret' }, lastDayOpen ? '▴' : '▾')),
    lastDayOpen ? h('div', { class: 'exs' }, d.entries.map(renderReadOnlyEntry)) : null);
}
// ---------- Calendar month grid ----------
const GRID_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4M9.5 10v10M14.5 10v10M3.5 15h17"/></svg>';
const LIST_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r="1" class="fill"/><circle cx="4" cy="12" r="1" class="fill"/><circle cx="4" cy="18" r="1" class="fill"/></svg>';
let calMode = 'list';
let gridMonth = null;
function monthBlock(first) {
  const t = todayKey();
  const y = first.getFullYear(), m = first.getMonth();
  const cells = [];
  for (let i = 0; i < first.getDay(); i++) cells.push(h('div', { class: 'mcell blank' }));
  const days = new Date(y, m + 1, 0).getDate();
  for (let n = 1; n <= days; n++) {
    const k = keyOf(new Date(y, m, n));
    const day = getDay(k);
    const entries = day ? day.entries : [];
    const rest = isRestDay(k, day) || (k < t && !entries.length);
    const color = rest ? '' : dayColor(day);
    const name = day && day.name.trim();
    cells.push(h('div', { class: `mcell${k === t ? ' today' : ''}${k > t ? ' future' : ''}${entries.length ? ' has' : ''}${color ? ' tinted' : ''}`,
      style: color ? `--day:${color}` : null, onclick: () => openDaySheet(k) },
      h('span', { class: 'mnum' }, String(n)),
      name && !rest ? h('span', { class: 'mtype' }, name) : null,
      entries.length ? h('span', { class: 'mbars' }, entries.slice(0, 4).map(() => h('i')), entries.length > 4 ? h('b', {}, `+${entries.length - 4}`) : null) : null));
  }
  return h('section', { class: 'mblock', 'data-month': keyOf(first) },
    h('div', { class: 'mlabel' }, fmt(first, { month: 'long', year: 'numeric' })),
    h('div', { class: 'mgrid mdow' }, ['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d) => h('span', {}, d))),
    h('div', { class: 'mgrid mdays' }, cells));
}
const gridTop = () => document.querySelector('#view-log .topbar').getBoundingClientRect().bottom;
function currentGridMonth() {
  const top = gridTop();
  const el = [...document.querySelectorAll('#month .mblock')].find((b) => b.getBoundingClientRect().bottom > top + 1);
  return el ? { key: el.dataset.month, off: top - el.getBoundingClientRect().top } : null;
}
// Month view: every month stacked, each one screen tall; scroll up and down between them.
function renderMonthGrid(focusKey) {
  const root = document.getElementById('month');
  const t = todayKey();
  const now = dateOf(t);
  const monthOf = (k) => { const d = dateOf(k); return keyOf(new Date(d.getFullYear(), d.getMonth(), 1)); };
  const keep = focusKey ? null : currentGridMonth();
  let start = new Date(now.getFullYear(), now.getMonth() - 12, 1);
  const logged = Object.keys(state.days).filter((k) => state.days[k].entries.length).sort();
  if (logged.length && dateOf(monthOf(logged[0])) < start) start = dateOf(monthOf(logged[0]));
  const end = new Date(now.getFullYear(), now.getMonth() + 6, 1);
  const blocks = [];
  for (let d = start; d <= end; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) blocks.push(monthBlock(d));
  const tab = document.querySelector('.tabbar').getBoundingClientRect().height;
  root.style.setProperty('--mh', `${Math.max(340, window.innerHeight - tab - document.querySelector('#view-log .topbar').offsetHeight)}px`);
  root.replaceChildren(...blocks);
  const target = keep || { key: monthOf(focusKey || t), off: 0 };
  const el = root.querySelector(`[data-month="${target.key}"]`);
  if (el) window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - gridTop() + target.off);
  updateTitle();
}
function setCalMode(mode, quiet) {
  calMode = mode;
  try { localStorage.setItem('workouts.calMode', mode); } catch (_) {}
  const grid = mode === 'grid';
  document.getElementById('month').hidden = !grid;
  feedEl.hidden = grid;
  document.getElementById('cal-toggle').innerHTML = grid ? LIST_ICON : GRID_ICON;
  document.getElementById('cal-toggle').setAttribute('aria-label', grid ? 'List view' : 'Month view');
  document.getElementById('view-log').classList.toggle('grid-mode', grid);
  if (quiet) return;
  if (grid) renderMonthGrid(todayKey());
  else requestAnimationFrame(() => { scrollToToday(false); updateTitle(); });
}
document.getElementById('cal-toggle').addEventListener('click', () => setCalMode(calMode === 'grid' ? 'list' : 'grid'));

// The Today tab shows one day: today by default, or an earlier day picked from the title (never the future).
let viewDay = null;
const dayViewKey = () => (viewDay && viewDay < todayKey() ? viewDay : todayKey());
const todayTabActive = () => document.getElementById('view-today').classList.contains('active');
function setViewDay(key) {
  closeDayPicker();
  viewDay = key >= todayKey() ? null : key;
  lastDayOpen = false;
  closePad();
  renderToday();
  window.scrollTo(0, 0);
}
function shiftViewDay(n) {
  const d = dateOf(dayViewKey());
  d.setDate(d.getDate() + n);
  setViewDay(keyOf(d));
}
function dayTitleText(key) {
  const t = todayKey();
  if (key === t) return 'Today';
  const y = dateOf(t); y.setDate(y.getDate() - 1);
  if (key === keyOf(y)) return 'Yesterday';
  return fmt(dateOf(key), { weekday: 'short', month: 'short', day: 'numeric' });
}
let dayPop = null;
function closeDayPicker() { if (dayPop) { dayPop.remove(); dayPop = null; } }
function openDayPicker() {
  if (dayPop) { closeDayPicker(); return; }
  const title = document.getElementById('day-title');
  const list = h('div', { class: 'daypop' });
  let shown = 0;
  const addDays = (n) => {
    const d = dateOf(todayKey());
    d.setDate(d.getDate() - shown);
    for (let i = 0; i < n; i++, shown++, d.setDate(d.getDate() - 1)) {
      const k = keyOf(d);
      const day = getDay(k);
      const worked = day && day.entries.length;
      const color = worked && !isRestDay(k, day) ? dayColor(day) : '';
      const name = dayTitleText(k);
      const label = name === 'Today' || name === 'Yesterday' ? `${name} · ${fmt(d, { month: 'short', day: 'numeric' })}`
        : fmt(d, { weekday: 'short', month: 'short', day: 'numeric', year: d.getFullYear() === today().getFullYear() ? undefined : 'numeric' });
      list.append(h('button', { class: `dprow${k === dayViewKey() ? ' on' : ''}`, style: color ? `--day:${color}` : null, onclick: () => setViewDay(k) },
        h('span', { class: `dp-dot${worked ? ' on' : ''}` }),
        h('span', { class: 'grow' }, h('div', { class: 'dp-date' }, label),
          h('div', { class: 'dp-sub' }, worked ? `${day.name.trim() || 'Workout'} · ${day.entries.length} exercise${day.entries.length > 1 ? 's' : ''}` : 'rest day'))));
    }
  };
  addDays(30);
  list.addEventListener('scroll', () => { if (list.scrollTop + list.clientHeight > list.scrollHeight - 80) addDays(30); }, { passive: true });
  const r = title.getBoundingClientRect();
  list.style.top = `${r.bottom + 6}px`;
  list.style.left = `${Math.max(10, r.left - 4)}px`;
  document.body.append(list);
  dayPop = list;
}
document.addEventListener('pointerdown', (e) => { if (dayPop && !e.target.closest('.daypop, #day-title')) closeDayPicker(); }, true);
document.getElementById('day-title').addEventListener('click', openDayPicker);
// Today's box reaches down so the last-workout bar rests just above the tab bar; opening it only grows the page downward.
function sizeTodayBox() {
  const root = document.getElementById('today');
  const box = root && root.firstElementChild;
  if (!box) return;
  box.classList.add('daybox');
  box.style.minHeight = '';
  const bar = root.querySelector('.lastday .wbar');
  if (!todayTabActive()) return;
  const tabTop = document.querySelector('.tabbar').getBoundingClientRect().top;
  const welcome = root.querySelector('.welcome');
  if (welcome) {
    welcome.style.minHeight = '';
    const space = tabTop - welcome.getBoundingClientRect().top - 14;
    if (space > 160) welcome.style.minHeight = `${Math.round(space)}px`;
  }
  if (!root.classList.contains('typed')) return;
  const top = box.getBoundingClientRect().top + window.scrollY;
  const room = tabTop - (bar ? bar.offsetHeight + 18 : 0) - 14 - top;
  if (room <= 0) return;
  box.style.minHeight = `${room}px`;
  const exs = root.querySelector('.lastday .exs');
  if (exs) exs.hidden = true;
  const extra = document.documentElement.scrollHeight - window.innerHeight;
  if (exs) exs.hidden = false;
  if (extra > 0) box.style.minHeight = `${Math.max(0, room - extra)}px`;
}
const resizeToday = () => { if (todayTabActive() && !document.body.classList.contains('pad-open')) sizeTodayBox(); };
window.addEventListener('resize', resizeToday);
// On launch from the home screen iOS settles the screen size late; re-measure a few times.
window.addEventListener('load', resizeToday);
window.addEventListener('pageshow', resizeToday);
if (window.visualViewport) visualViewport.addEventListener('resize', resizeToday);
if (document.fonts && document.fonts.ready) document.fonts.ready.then(resizeToday);
// Launched from the home screen, iOS can start the layout a status-bar short (a gap under the
// tabs) until the page scrolls once, which is why Calendar -> Today fixed it. Do that scroll invisibly.
function fixLaunchViewport() {
  if (!navigator.standalone || window.scrollY > 2 || window.innerWidth > window.innerHeight) return;
  if (window.innerHeight >= screen.height - 1) return;
  const b = document.body, prev = b.style.minHeight;
  b.style.minHeight = `${screen.height + 4}px`;
  window.scrollTo(0, 2);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    window.scrollTo(0, 0); b.style.minHeight = prev; resizeToday();
  }));
}
[0, 100, 400, 1000, 2000].forEach((ms) => setTimeout(() => { fixLaunchViewport(); resizeToday(); }, ms));
window.addEventListener('pageshow', fixLaunchViewport);
function renderToday() {
  const root = document.getElementById('today');
  if (!root) return;
  const key = dayViewKey();
  const isT = key === todayKey();
  const short = fmt(dateOf(key), { weekday: 'short', month: 'short', day: 'numeric' });
  document.getElementById('day-title').replaceChildren(isT ? 'Today' : short, h('span', { class: 'caret' }, ' ▾'));
  const last = lastDayBar(key);
  root.classList.toggle('with-last', !!last);
  root.replaceChildren(renderDay(key, true), last || '');
  syncWelcome();
  renderTodayType();
  sizeTodayBox();
}
function syncWelcome() {
  const root = document.getElementById('today');
  const key = dayViewKey();
  const day = getDay(key);
  const empty = key === todayKey() && !(day && (day.name.trim() || day.entries.length));
  const cur = root.querySelector('.welcome');
  if (!empty) { if (cur) cur.remove(); return; }
  if (cur) return;
  const glyph = document.querySelector('.tab[data-view="exercises"] svg');
  const lastK = pastDaysDesc(key).find((x) => state.days[x].entries.length);
  const lastColor = lastK ? dayColor(state.days[lastK]) : '';
  root.firstElementChild.after(h('div', { class: 'welcome' },
    glyph ? h('div', { class: 'wglyph' }, glyph.cloneNode(true)) : null,
    h('h2', {}, 'Welcome to Workouts'),
    lastK ? h('p', {}, 'Your last workout was ', h('b', { style: lastColor ? `color:${lastColor}` : null }, state.days[lastK].name.trim() || 'a workout'),
      ` · ${fmt(dateOf(lastK), { weekday: 'short', month: 'short', day: 'numeric' })}`) : null,
    h('p', { class: 'wask' }, 'What are you doing today?'),
    h('div', { class: 'wpicks' },
      state.presets.map((p) => {
        const c = state.presetColors[p.trim().toLowerCase()];
        return h('button', { class: 'wpick', style: c ? `--day:${c}` : null, onclick: () => { ensureDay(key).name = p; cleanupDay(key); afterDayEdit(key); } }, p);
      }),
      h('button', { class: 'wpick more', onclick: () => openPresetPicker(key) }, 'Other…'))));
}
function renderTodayType() {
  const slot = document.getElementById('today-type');
  const dt = document.querySelector('#today .dhead .daytype');
  if (slot && dt) slot.replaceChildren(dt);
  const cur = slot && slot.querySelector('.daytype');
  document.getElementById('today').classList.toggle('typed', !!cur && !cur.classList.contains('empty'));
}

function scrollToKey(key, smooth, alignEnd) {
  const el = feedEl.querySelector(`[data-key="${key}"]`);
  if (!el) return;
  const top = topInset() + 8;
  const bottom = bottomInset() - 8;
  const r = el.getBoundingClientRect();
  const fits = r.height <= bottom - top;
  const delta = alignEnd === 'center' && fits ? r.top + r.height / 2 - (top + bottom) / 2
    : alignEnd && fits ? r.bottom - bottom : r.top - top;
  window.scrollBy({ top: delta, behavior: smooth ? 'smooth' : 'auto' });
}
const scrollToToday = (smooth) => { if (logActive() && calMode === 'list' && Date.now() - (typeof jumpHold === 'number' ? jumpHold : 0) > 1500) scrollToKey(todayKey(), smooth, 'center'); };

function jumpTo(key) {
  const d = dateOf(key);
  if (d < rangeOldest || d > rangeNewest) {
    rangeOldest = minDate(rangeOldest, monthStart(d));
    rangeNewest = maxDate(rangeNewest, monthEnd(d));
    renderFeed();
    renderToday();
  }
  jumpHold = Date.now();
  showView('log');
  requestAnimationFrame(() => scrollToKey(key, false, false));
  setTimeout(() => { scrollToKey(key, false, false); updateTitle(); }, 450);
}
let jumpHold = 0;
const jumpInput = document.getElementById('jump-input');
jumpInput.addEventListener('focus', () => { jumpInput.value = calMode === 'grid' ? (currentGridMonth() || { key: todayKey() }).key : todayKey(); jumpHold = Date.now(); });
jumpInput.addEventListener('change', () => {
  const v = jumpInput.value;
  if (!v) return;
  jumpInput.blur();
  if (calMode === 'grid') { renderMonthGrid(v); setTimeout(() => renderMonthGrid(v), 450); } else jumpTo(v);
});

const logActive = () => document.getElementById('view-log').classList.contains('active');
function extendPast() {
  const from = monthStart(rangeOldest, -2);
  const to = addDays(rangeOldest, -1);
  rangeOldest = from;
  keepAnchor(() => feedEl.prepend(renderRange(from, to)));
}
function checkSentinels() {
  if (!logActive()) return;
  if (document.getElementById('top-sentinel').getBoundingClientRect().bottom > -1200) extendPast();
  if (document.getElementById('bottom-sentinel').getBoundingClientRect().top < innerHeight + 1200) extendFuture();
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

document.getElementById('today-btn').addEventListener('click', () => { if (calMode === 'grid') renderMonthGrid(todayKey()); });
document.querySelector('.tab[data-view="log"]').addEventListener('click', () => { if (calMode === 'grid') requestAnimationFrame(() => renderMonthGrid(todayKey())); });
document.querySelector('.tab[data-view="today"]').addEventListener('click', () => requestAnimationFrame(sizeTodayBox));
document.getElementById('today-btn').addEventListener('click', () => scrollToToday(true));

// ---------- sheet ----------
const sheet = document.getElementById('sheet');
const backdrop = document.getElementById('sheet-backdrop');
const sheetBody = document.getElementById('sheet-body');
function openSheet(title, ...content) {
  document.getElementById('sheet-title').textContent = title;
  sheetBody.textContent = '';
  sheetBody.append(...content.filter((c) => c != null && c !== false && c !== ''));
  if (typeof closePad === 'function') closePad();
  if (sheet.hidden) sheetAnchor = captureAnchor();
  sheet.hidden = false;
  backdrop.hidden = false;
  sheetBody.scrollTop = 0;
}
let sheetAnchor = null;
let restoreTimer = null;
function closeSheet() {
  sheet.hidden = true;
  backdrop.hidden = true;
  sheetBody.textContent = '';
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  const a = sheetAnchor;
  sheetAnchor = null;
  if (!a) return;
  // The iPhone keyboard can shift the page while it closes, so restore again once it has settled.
  requestAnimationFrame(() => { restoreAnchor(a); checkSentinels(); });
  clearTimeout(restoreTimer);
  restoreTimer = setTimeout(() => restoreAnchor(a), 450);
}

// Sheets never scroll the calendar behind them; dragging down from the top closes them.
function sheetGestures(box, body, back, close) {
  let y0 = 0, dy = 0, drag = false, canDrag = false;
  back.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
  box.addEventListener('touchstart', (e) => {
    y0 = e.touches[0].clientY; dy = 0; drag = false;
    canDrag = !!e.target.closest('.sheet-head') || body.scrollTop <= 0;
    box.style.transition = '';
  }, { passive: true });
  box.addEventListener('touchmove', (e) => {
    dy = e.touches[0].clientY - y0;
    if (canDrag && (drag || dy > 6)) {
      drag = true;
      e.preventDefault();
      box.style.transform = `translateY(${Math.max(0, dy)}px)`;
      return;
    }
    if (!body.contains(e.target) || body.scrollHeight <= body.clientHeight) e.preventDefault();
  }, { passive: false });
  box.addEventListener('touchend', () => {
    if (!drag) return;
    drag = false;
    box.style.transition = 'transform 0.2s ease';
    if (dy > 90) {
      box.style.transform = 'translateY(100%)';
      setTimeout(() => { box.style.transition = ''; box.style.transform = ''; close(); }, 200);
    } else box.style.transform = '';
  });
}
sheetGestures(sheet, sheetBody, backdrop, closeSheet);

// iPhone's keyboard covers fixed bottom sheets; lift open sheets above it and shrink them to the visible area.
function fitSheetsToKeyboard() {
  const vv = window.visualViewport;
  if (!vv) return;
  // Pin the sheet to the visible area by its top edge: iOS may shrink innerHeight and pan the page when the keyboard opens.
  const a = document.activeElement;
  const typing = a && a.closest && a.closest('.sheet') && (a.tagName === 'TEXTAREA' || (a.tagName === 'INPUT' && !['checkbox', 'radio', 'file', 'button', 'color'].includes(a.type)));
  const open = typing && vv.height < (window.screen ? screen.height : window.innerHeight) * 0.8;
  document.querySelectorAll('.sheet').forEach((s) => {
    s.style.top = open ? `${Math.round(vv.offsetTop + 8)}px` : '';
    s.style.bottom = open ? 'auto' : '';
    s.style.height = open ? `${Math.round(vv.height - 8)}px` : '';
    s.style.maxHeight = open ? 'none' : '';
  });
}
if (window.visualViewport) {
  visualViewport.addEventListener('resize', fitSheetsToKeyboard);
  visualViewport.addEventListener('scroll', fitSheetsToKeyboard);
  document.addEventListener('focusin', () => setTimeout(fitSheetsToKeyboard, 50));
  document.addEventListener('focusout', () => setTimeout(fitSheetsToKeyboard, 50));
}
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
    afterDayEdit(key);
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
    day && day.name ? h('button', { class: 'btn', onclick: () => setName('') }, 'Clear name') : null);
}

// ---------- exercise picker (add to a day) ----------
function sortedExercises() {
  return state.exercises.slice().sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}

// Recency-weighted use: each use counts 0.5^(days ago / 21); unfinished entries count less.
// `typed` only counts days with the given day type, so same-type exercises can be ranked first.
function usageScores(type) {
  const all = new Map();
  const typed = new Map();
  const t = today().getTime();
  for (const [k, d] of Object.entries(state.days)) {
    const ago = (t - dateOf(k).getTime()) / 86400000;
    if (ago < 0) continue;
    const w = Math.pow(0.5, ago / 21);
    const sameType = type && d.name.trim().toLowerCase() === type;
    for (const e of d.entries) {
      const v = w * (isDone(k, e) ? 1 : 0.4);
      all.set(e.exerciseId, (all.get(e.exerciseId) || 0) + v);
      if (sameType) typed.set(e.exerciseId, (typed.get(e.exerciseId) || 0) + v);
    }
  }
  return { all, typed };
}
// Tier 0: done on this day type; tier 1: done before; tier 2: never done (most common first).
function pickerOrder(key) {
  const day = getDay(key);
  const { all, typed } = usageScores(day && day.name.trim().toLowerCase());
  const rank = (ex) => (STARTER_RANK.has(ex.name.trim().toLowerCase()) ? STARTER_RANK.get(ex.name.trim().toLowerCase()) : -1);
  const tier = (ex) => (typed.has(ex.id) ? 0 : all.has(ex.id) ? 1 : 2);
  return state.exercises.map((ex) => ({ ex, tier: tier(ex) }))
    .sort((a, b) => a.tier - b.tier || (typed.get(b.ex.id) || 0) - (typed.get(a.ex.id) || 0)
      || (all.get(b.ex.id) || 0) - (all.get(a.ex.id) || 0) || rank(a.ex) - rank(b.ex) || a.ex.name.localeCompare(b.ex.name));
}
function matches(ex, q) { return !q || ex.name.toLowerCase().includes(q); }

function openExercisePicker(key) {
  const search = h('input', { class: 'search', type: 'search', 'aria-label': 'Search exercises', ...NO_CAPS });
  const list = h('div', {});
  const draw = () => {
    const q = search.value.trim().toLowerCase();
    list.textContent = '';
    if (!state.exercises.length) list.append(h('p', { class: 'empty' }, 'No exercises yet.'));
    let items = pickerOrder(key).filter(({ ex }) => matches(ex, q));
    const dayName = (getDay(key) || { name: '' }).name.trim();
    const labels = [`For ${dayName}`, 'Your exercises', 'All exercises'];
    if (q) items = items.filter(({ ex }) => ex.name.toLowerCase().startsWith(q)).concat(items.filter(({ ex }) => !ex.name.toLowerCase().startsWith(q)));
    let section = null;
    for (const { ex, tier } of items) {
      const label = q ? null : labels[tier];
      if (label && label !== section) { section = label; list.append(h('div', { class: 'psec' }, label)); }
      list.append(h('div', { class: 'choice', onclick: () => addToDay(key, ex) }, icon(ex), h('div', { class: 'grow' }, exerciseText(ex))));
    }
  };
  search.addEventListener('input', draw);
  draw();
  openSheet(`Add to ${fmt(dateOf(key), { weekday: 'short', month: 'short', day: 'numeric' })}`,
    search,
    list,
    h('button', { class: 'btn', onclick: () => openExerciseForm(null, () => openExercisePicker(key)) }, '+ New exercise'));
}

function addToDay(key, ex) {
  const entry = { id: uid(), exerciseId: ex.id, name: ex.name, image: ex.image || '', sets: [cloneSpec(ex.spec)] };
  if (ex.icon) entry.icon = ex.icon;
  if (ex.details) entry.details = ex.details;
  ensureDay(key).entries.push(entry);
  save();
  const inline = todayTabActive() && key === dayViewKey();
  if (!inline) { entry.done = true; refreshDay(key); openEntryEditor(key, entry.id); return; }
  entry.done = false;
  save();
  closeSheet();
  refreshDay(key);
  const blank = document.querySelector('#today .ex-wrap:last-child .nf');
  if (blank && !blank.textContent) openPad(blank);
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
    setsWrap.replaceChildren(...sets.map((spec, i) => fieldDiv(sets.length > 1 ? `Set ${i + 1}` : 'What you track', blockEditor(spec),
      sets.length > 1 ? h('button', { class: 'link', onclick: () => { sets.splice(i, 1); drawSets(); } }, 'Remove set') : null)));
  };
  drawSets();
  const done = () => afterDayEdit(key);
  const move = (delta) => {
    const j = idx + delta;
    if (j < 0 || j >= day.entries.length) return;
    [day.entries[idx], day.entries[j]] = [day.entries[j], day.entries[idx]];
    done();
  };
  openSheet('This day only',
    field('Name', name),
    setsWrap,
    h('button', { class: 'btn small', onclick: () => { sets.push(blankSpec(sets[sets.length - 1] || [])); drawSets(); } }, '+ Add row'),
    h('button', { class: 'btn primary', onclick: () => {
      entry.name = name.value.trim() || entry.name;
      entry.sets = sets;
      done();
    } }, 'Save'),
    isLocked(key) ? null : isDone(key, entry)
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
  // Icon: optional, built from a pose + equipment only if you open the builder.
  let iconSpec = ex && ex.iconSpec ? { ...ex.iconSpec } : null;
  const glyph = h('div', { class: 'icon-prev' });
  const poseRow = h('div', { class: 'ichips' });
  const equipRow = h('div', { class: 'ichips' });
  const currentIcon = () => (iconSpec ? IconKit.url(iconSpec.pose, iconSpec.equip) : ex && ex.icon) || '';
  const drawIcon = () => {
    const spec = iconSpec || IconKit.guess(name.value);
    glyph.replaceChildren(icon({ name: name.value, icon: currentIcon() }, 'lg'));
    const chips = (row, table, keyName) => row.replaceChildren(...Object.entries(table).map(([k, v]) =>
      h('button', { class: `pill${iconSpec && spec[keyName] === k ? ' on' : ''}`, onclick: () => { iconSpec = { ...spec, [keyName]: k }; drawIcon(); } }, v.label)));
    chips(poseRow, IconKit.POSES, 'pose');
    chips(equipRow, IconKit.EQUIP, 'equip');
  };
  drawIcon();
  const builderBody = h('div', { class: 'icon-builder', hidden: !iconSpec }, glyph,
    h('div', { class: 'grow' }, h('div', { class: 'ilabel' }, 'Pose'), poseRow, h('div', { class: 'ilabel' }, 'Equipment'), equipRow));
  const builderBtn = h('button', { class: 'pill build-icon', hidden: !!iconSpec, onclick: () => { builderBody.hidden = false; builderBtn.hidden = true; } }, 'Build an icon');
  const builder = h('div', { class: 'field' }, builderBtn, builderBody);
  const saveBtn = h('button', { class: 'btn primary', disabled: !(ex && ex.name.trim()) }, 'Save');
  name.addEventListener('input', () => { saveBtn.disabled = !name.value.trim(); drawIcon(); });
  saveBtn.addEventListener('click', () => {
    const data = { name: name.value.trim(), spec, image: isImage(image) ? image : '' };
    if (iconSpec) { data.icon = IconKit.url(iconSpec.pose, iconSpec.equip); data.iconSpec = iconSpec; }
    if (!data.name) return;
    if (ex) { Object.assign(ex, data); delete ex.details; } else state.exercises.push({ id: uid(), ...data });
    save();
    renderExercises();
    if (afterSave) afterSave(); else closeSheet();
  });
  openSheet(ex ? 'Edit exercise' : 'New exercise',
    field('Name', name),
    fieldDiv('What you track', blockEditor(spec)),
    ex && ex.details ? h('p', { class: 'hint' }, `Old details: ${ex.details}`) : null,
    fieldDiv('Picture (optional)', h('div', {},
      h('label', { class: 'pill' }, 'Choose photo', photo),
      h('div', { class: 'or' }, 'or paste a link'),
      link)),
    preview,
    builder,
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
  const q = exSearch.value.trim().toLowerCase();
  for (const ex of sortedExercises().filter((x) => matches(x, q))) {
    list.append(h('li', { onclick: () => openHistory(ex) }, icon(ex, 'lg'), h('div', { class: 'grow' }, exerciseText(ex))));
  }
  document.getElementById('exercise-empty').hidden = state.exercises.length > 0;
}
document.getElementById('new-exercise-btn').addEventListener('click', () => openExerciseForm(null));

// ---------- exercise history: every logged day plus a chart of one number per day ----------
const WEIGHT_UNITS = new Set(['lb', 'kg']);
const SUM_UNITS = new Set(['min', 'sec', 'hr', 'mi', 'km', 'm', 'floors', 'steps', 'cal', 'rounds']);
const numOf = (b) => { const n = parseFloat(String(b.value || '').replace(',', '.')); return Number.isFinite(n) ? n : null; };
function exerciseLogs(ex) {
  const t = todayKey();
  const name = ex.name.trim().toLowerCase();
  return Object.entries(state.days).filter(([k]) => k <= t).sort(([a], [b]) => (a < b ? 1 : -1))
    .flatMap(([key, day]) => day.entries.filter((e) => e.exerciseId === ex.id || (!state.exercises.some((x) => x.id === e.exerciseId) && e.name.trim().toLowerCase() === name))
      .map((entry) => ({ key, day, entry })));
}
// One number per set group: weight in the profile unit (assisted counts as negative), sets × reps, etc.
function setParts(spec) {
  const w = weightUnit();
  const out = { sets: 1, reps: null, weight: null, units: {} };
  let weightField = false;
  spec.forEach((b) => {
    if (WEIGHT_UNITS.has(b.unit)) weightField = true;
    const n = numOf(b);
    if (n == null) return;
    if (b.unit === 'sets') out.sets = n;
    else if (b.unit === 'reps') out.reps = n;
    else if (WEIGHT_UNITS.has(b.unit)) {
      const v = b.unit === w ? n : w === 'lb' ? n * 2.20462 : n / 2.20462;
      out.weight = Math.round((b.join === '−' ? -v : v) * 10) / 10;
      out.added = b.join === '+' || b.join === '−';
    } else out.units[b.unit] = n;
  });
  if (out.weight == null && weightField && out.reps != null) {
    out.weight = 0;
    out.added = spec.some((b) => WEIGHT_UNITS.has(b.unit) && (b.join === '+' || b.join === '−'));
  }
  return out;
}
function historyMetrics(logs) {
  const parts = logs.map((l) => ({ key: l.key, sets: l.entry.sets.map(setParts) }));
  const has = (f) => parts.some((p) => p.sets.some(f));
  const metrics = [];
  const w = weightUnit();
  const series = (fn) => parts.map((p) => ({ key: p.key, v: fn(p.sets) })).filter((pt) => pt.v != null);
  if (has((s) => s.weight != null)) {
    metrics.push({ id: 'weight', label: 'Weight', unit: w, pts: series((ss) => { const v = ss.map((s) => s.weight).filter((x) => x != null); return v.length ? Math.max(...v) : null; }) });
    if (has((s) => s.reps != null && s.weight != null)) {
      // Bodyweight lifts (+/− weight) count your profile weight plus what you added.
      const kg = state.profile.weightKg;
      const bw = kg == null ? null : w === 'lb' ? kg * 2.20462 : kg;
      const load = (s) => (s.added ? (bw == null ? null : bw + s.weight) : s.weight);
      metrics.push({ id: 'volume', label: 'Volume', unit: w, pts: series((ss) => { const v = ss.filter((s) => s.reps != null && s.weight != null && load(s) > 0); return v.length ? Math.round(v.reduce((a, s) => a + s.sets * s.reps * load(s), 0)) : null; }) });
    }
  }
  if (has((s) => s.reps != null)) {
    metrics.push({ id: 'reps', label: 'Reps', unit: 'reps', pts: series((ss) => { const v = ss.filter((s) => s.reps != null); return v.length ? v.reduce((a, s) => a + s.sets * s.reps, 0) : null; }) });
  }
  const units = [...new Set(parts.flatMap((p) => p.sets.flatMap((s) => Object.keys(s.units))))];
  units.forEach((u) => {
    const sum = SUM_UNITS.has(u);
    metrics.push({ id: `u:${u}`, label: u === 'min' ? 'Time' : u === 'level' ? 'Level' : u, unit: u, pts: series((ss) => {
      const v = ss.map((s) => (s.units[u] == null ? null : (sum ? s.sets : 1) * s.units[u])).filter((x) => x != null);
      if (!v.length) return null;
      return Math.round((sum ? v.reduce((a, b) => a + b, 0) : Math.max(...v)) * 10) / 10;
    }) });
  });
  if (units.includes('level') && units.includes('min')) {
    metrics.push({ id: 'effort', label: 'Effort', unit: 'level × min', pts: series((ss) => {
      const v = ss.filter((s) => s.units.level != null && s.units.min != null);
      return v.length ? Math.round(v.reduce((a, s) => a + s.sets * s.units.level * s.units.min, 0)) : null;
    }) });
  }
  return metrics.filter((m) => m.pts.length);
}
function historyChart(metric, onPick) {
  const pts = metric.pts.slice().reverse();
  const W = 320, H = 150, L = 34, R = 12, T = 14, B = 22;
  const xs = pts.map((p) => dateOf(p.key).getTime());
  const vs = pts.map((p) => p.v);
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  let y0 = Math.min(...vs), y1 = Math.max(...vs);
  if (y0 === y1) { y0 -= 1; y1 += 1; }
  const pad = (y1 - y0) * 0.12;
  y0 -= pad; y1 += pad;
  const X = (x) => (x1 === x0 ? (L + W - R) / 2 : L + ((x - x0) / (x1 - x0)) * (W - L - R));
  const Y = (v) => T + (1 - (v - y0) / (y1 - y0)) * (H - T - B);
  const ns = 'http://www.w3.org/2000/svg';
  const el = (tag, attrs, text) => { const e = document.createElementNS(ns, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); if (text != null) e.textContent = text; return e; };
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'hchart' });
  const fmtV = (v) => (Math.abs(v) >= 1000 ? `${Math.round(v / 100) / 10}k` : String(Math.round(v * 10) / 10));
  const hi = Math.max(...vs), lo = Math.min(...vs);
  [[hi, Y(hi)], [lo, Y(lo)]].forEach(([v, y], i) => {
    if (i && hi === lo) return;
    svg.append(el('line', { x1: L, x2: W - R, y1: y, y2: y, class: 'hgrid' }), el('text', { x: L - 6, y: y + 4, class: 'hlabel', 'text-anchor': 'end' }, fmtV(v)));
  });
  const short = (k) => fmt(dateOf(k), { month: 'short', day: 'numeric' });
  svg.append(el('text', { x: L, y: H - 6, class: 'hlabel' }, short(pts[0].key)));
  if (pts.length > 1) svg.append(el('text', { x: W - R, y: H - 6, class: 'hlabel', 'text-anchor': 'end' }, short(pts[pts.length - 1].key)));
  if (pts.length > 1) svg.append(el('polyline', { points: pts.map((p, i) => `${X(xs[i])},${Y(p.v)}`).join(' '), class: 'hline' }));
  pts.forEach((p, i) => {
    const g = el('g', { class: 'hdot', 'data-key': p.key });
    g.append(el('circle', { cx: X(xs[i]), cy: Y(p.v), r: 14, class: 'hhit' }), el('circle', { cx: X(xs[i]), cy: Y(p.v), r: 4.5, class: 'hpt' }));
    g.addEventListener('click', () => onPick(p));
    svg.append(g);
  });
  return svg;
}
function defaultMetric(metrics) {
  return (metrics.find((m) => m.id === 'weight') || metrics.find((m) => m.id === 'reps') || metrics.find((m) => m.id === 'u:min') || metrics[0] || {}).id;
}
const HISTORY_RANGES = [['1m', '1M', 1], ['3m', '3M', 3], ['6m', '6M', 6], ['1y', '1Y', 12], ['all', 'All', 0]];
let historyRange = 'all';
function rangeStart(id) {
  const r = HISTORY_RANGES.find((x) => x[0] === id);
  if (!r || !r[2]) return '';
  const d = today();
  d.setMonth(d.getMonth() - r[2]);
  return keyOf(d);
}
function openHistory(ex) {
  const logs = exerciseLogs(ex);
  const allMetrics = historyMetrics(logs);
  let metrics = allMetrics;
  let current = defaultMetric(metrics);
  const ranges = h('div', { class: 'hranges' });
  const chartWrap = h('div', { class: 'hchart-wrap' });
  const readout = h('div', { class: 'hreadout' });
  const chips = h('div', { class: 'hchips' });
  const rows = h('div', {});
  const show = (m, v) => (m.id === 'weight' && v < 0 ? `assist ${-v} ${m.unit}` : m.id === 'weight' && v === 0 ? 'bodyweight' : `${v} ${m.unit}`);
  const pick = (p) => {
    const m = metrics.find((x) => x.id === current);
    readout.textContent = `${fmt(dateOf(p.key), { weekday: 'short', month: 'short', day: 'numeric' })} · ${show(m, p.v)}`;
    chartWrap.querySelectorAll('.hdot').forEach((d) => d.classList.toggle('on', d.dataset.key === p.key));
    rows.querySelectorAll('.hrow').forEach((r) => r.classList.toggle('on', r.dataset.key === p.key));
    const row = rows.querySelector(`.hrow[data-key="${p.key}"]`);
    if (row) row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  };
  const draw = () => {
    const from = rangeStart(historyRange);
    metrics = allMetrics.map((x) => ({ ...x, pts: x.pts.filter((p) => p.key >= from) }));
    ranges.replaceChildren(...HISTORY_RANGES.map(([id, label]) => h('button', { class: `hrange${id === historyRange ? ' on' : ''}`, onclick: () => { historyRange = id; draw(); } }, label)));
    const m = metrics.find((x) => x.id === current);
    chips.replaceChildren(...metrics.map((x) => h('button', { class: `hchip${x.id === current ? ' on' : ''}`, onclick: () => { current = x.id; draw(); } }, x.label)));
    chartWrap.replaceChildren(m && m.pts.length ? historyChart(m, pick) : h('p', { class: 'hint hempty' }, 'No workouts in this range.'));
    const last = m && m.pts[0];
    readout.textContent = last ? `Latest · ${show(m, last.v)}` : '';
  };
  rows.replaceChildren(...logs.map(({ key, day, entry }) => h('div', { class: 'hrow', 'data-key': key },
    h('div', { class: 'hdate' }, fmt(dateOf(key), { weekday: 'short', month: 'short', day: 'numeric', year: dateOf(key).getFullYear() === today().getFullYear() ? undefined : 'numeric' }),
      day.name.trim() ? h('span', { class: 'hday' }, ` · ${day.name}`) : null),
    entry.sets.map(doneSummary).filter(Boolean).map((t) => h('div', { class: 'set-text' }, t)))));
  if (allMetrics.length) draw();
  openSheet(ex.name,
    h('button', { class: 'btn small', onclick: () => openExerciseForm(ex) }, 'Edit exercise'),
    logs.length ? null : h('p', { class: 'hint' }, 'No history yet. Log this exercise on a day and it shows up here.'),
    allMetrics.length ? h('div', { class: 'hbox' }, chips, readout, chartWrap, ranges) : null,
    rows);
}
const exSearch = document.getElementById('exercise-search');
exSearch.addEventListener('input', renderExercises);

// ---------- profile ----------
function applyTheme() {
  const t = state.profile.theme;
  document.documentElement.style.setProperty('--accent', state.profile.accent);
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

const PALETTES = [['Blue', '#1e40af'], ['Red', '#b91c1c'], ['Orange', '#ea580c'], ['Green', '#15803d'], ['Teal', '#0f766e'], ['Purple', '#6d28d9']];
function colorPicker(p) {
  const swatches = PALETTES.map(([name, a]) => h('button', {
    class: `swatch${p.accent === a ? ' on' : ''}`, 'aria-label': name, title: name, style: `background: ${a}`,
    onclick: () => { p.accent = a; save(); applyTheme(); renderProfile(); } }));
  const custom = h('input', { type: 'color', value: p.accent, 'aria-label': 'Custom color' });
  custom.addEventListener('input', () => { p.accent = custom.value; save(); applyTheme(); });
  custom.addEventListener('change', renderProfile);
  const isCustom = !PALETTES.some(([, a]) => a === p.accent);
  return h('div', { class: 'colors one-row' }, swatches,
    h('label', { class: `swatch custom${isCustom ? ' on' : ''}`, title: 'Custom', style: isCustom ? `background: ${p.accent}` : null }, custom));
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
const isBackup = (data) => data && typeof data.days === 'object' && Array.isArray(data.exercises);
function replaceState(data) {
  state = normalize(data);
  save();
  applyTheme();
  initRange();
  renderFeed();
  renderToday();
  renderExercises();
  renderProfile();
  requestAnimationFrame(() => scrollToToday(false));
}
// ---------- GitHub backup: one JSON file in a private repo; GitHub keeps every version ----------
function gh(path, opts = {}) {
  return fetch(`https://api.github.com/repos/${cloud.repo}${path ? `/${path}` : ''}`, {
    cache: 'no-store', ...opts,
    headers: { Authorization: `Bearer ${cloud.token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...(opts.headers || {}) },
  });
}
function toBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
function ghError(status) {
  if (status === 401) return 'GitHub did not accept the key.';
  if (status === 403 || status === 404) return 'The key cannot reach that repo. Check the repo name and that the key has Contents: Read and write.';
  return `GitHub error ${status}.`;
}
async function fetchSha() {
  const r = await gh(`contents/${cloud.path}`);
  if (r.status === 404) return '';
  if (!r.ok) throw new Error(ghError(r.status));
  return (await r.json()).sha || '';
}
async function backupNow(force) {
  clearTimeout(backupTimer);
  if (!cloud.token || backupBusy || (!cloud.dirty && !force) || !navigator.onLine) return false;
  backupBusy = true;
  const seq = editSeq;
  try {
    const content = toBase64(JSON.stringify(state));
    const put = () => gh(`contents/${cloud.path}`, { method: 'PUT',
      body: JSON.stringify({ message: `Backup ${new Date().toISOString()}`, content, ...(cloud.sha ? { sha: cloud.sha } : {}) }) });
    let r = await put();
    if (r.status === 409 || r.status === 422) { cloud.sha = await fetchSha(); r = await put(); }
    if (!r.ok) throw new Error(ghError(r.status));
    cloud.sha = (await r.json()).content.sha;
    cloud.lastAt = Date.now();
    cloud.error = '';
    cloud.dirty = editSeq !== seq;
    if (cloud.dirty) backupTimer = setTimeout(() => backupNow(), 60000);
    return true;
  } catch (e) {
    cloud.error = e.message || 'Backup failed.';
    return false;
  } finally {
    backupBusy = false;
    saveCloud();
    renderCloud();
  }
}
async function fetchCloudData() {
  const r = await gh(`contents/${cloud.path}`, { headers: { Accept: 'application/vnd.github.raw+json' } });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(ghError(r.status));
  const data = await r.json();
  if (!isBackup(data)) throw new Error('The file on GitHub is not a valid backup.');
  return data;
}
async function restoreFromCloud(ask = true) {
  try {
    const data = await fetchCloudData();
    if (!data) { alert('There is no backup on GitHub yet.'); return; }
    if (ask && !confirm('Replace everything on this phone with the GitHub backup?')) return;
    replaceState(data);
    cloud.sha = await fetchSha();
    cloud.dirty = false;
    cloud.error = '';
    cloud.lastAt = Date.now();
    clearTimeout(backupTimer);
    saveCloud();
    renderCloud();
    alert('Restored from GitHub.');
  } catch (e) { alert(e.message); }
}
async function connectCloud(token, repo) {
  cloud.token = token;
  cloud.repo = repo;
  try {
    const info = await gh('');
    if (!info.ok) throw new Error(ghError(info.status));
    const meta = await info.json();
    if (!meta.private && !confirm('That repo is public, so anyone could read your backups. Connect anyway?')) throw new Error('');
    cloud.sha = await fetchSha();
    saveCloud();
    if (cloud.sha && confirm('A backup is already on GitHub. Restore it to this phone now?\n\nCancel keeps this phone\'s data and backs it up over the old one (older versions stay in GitHub history).')) {
      await restoreFromCloud(false);
    } else {
      cloud.dirty = true;
      await backupNow(true);
    }
  } catch (e) {
    cloud.token = '';
    saveCloud();
    if (e.message) alert(e instanceof TypeError ? 'Could not reach GitHub. Check your connection and the repo name (owner/name).' : e.message);
  }
  renderCloud();
}
function ago(t) {
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  if (m < 1440) return `${Math.round(m / 60)} h ago`;
  return fmt(new Date(t), { month: 'short', day: 'numeric' });
}
function renderCloud() {
  const root = document.getElementById('cloud');
  if (!root) return;
  if (!cloud.token) {
    const repo = h('input', { value: cloud.repo, 'aria-label': 'Repo', ...NO_CAPS });
    const key = h('input', { type: 'password', 'aria-label': 'GitHub key', autocomplete: 'off', ...NO_CAPS });
    const go = h('button', { class: 'btn primary', onclick: async () => {
      if (!key.value.trim() || !repo.value.trim()) return;
      go.disabled = true;
      go.textContent = 'Connecting…';
      await connectCloud(key.value.trim(), repo.value.trim().replace(/^https:\/\/github\.com\//, '').replace(/\/$/, ''));
    } }, 'Connect');
    root.replaceChildren(
      h('p', { class: 'hint' }, 'Back up automatically to your private GitHub repo. The key is stored only on this phone.'),
      field('Repo', repo), field('GitHub key', key), go);
    return;
  }
  const status = cloud.error ? cloud.error
    : backupBusy ? 'Backing up…'
    : cloud.lastAt ? `Backed up ${ago(cloud.lastAt)}${cloud.dirty ? ' · changes waiting' : ''}` : 'Not backed up yet';
  root.replaceChildren(
    h('p', { class: `cstatus${cloud.error ? ' err' : ''}` }, status),
    h('p', { class: 'hint' }, `To ${cloud.repo}`),
    h('div', { class: 'btn-row' },
      h('button', { class: 'btn', onclick: () => backupNow(true) }, 'Back up now'),
      h('button', { class: 'btn', onclick: () => restoreFromCloud() }, 'Restore')),
    h('button', { class: 'link cdisc', onclick: () => {
      if (!confirm('Stop backing up to GitHub on this phone?')) return;
      cloud.token = '';
      cloud.sha = '';
      saveCloud();
      renderCloud();
    } }, 'Disconnect'));
}
document.addEventListener('visibilitychange', () => { if (cloud.dirty) backupNow(); });
window.addEventListener('online', () => { if (cloud.dirty) backupNow(); });
setTimeout(() => { if (cloud.dirty) backupNow(); }, 3000);
renderCloud();

// ---------- tabs ----------
// Coming back to the Calendar tab always centers today.
function showView(name) {
  const wasLog = document.getElementById('view-log').classList.contains('active');
  document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.id === `view-${name}`));
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.view === name));
  if (name === 'log' && !wasLog) { scrollToToday(false); updateTitle(); }
  else if (name !== 'log') window.scrollTo(0, 0);
  if (name === 'profile') renderCloud();
}
document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => showView(t.dataset.view)));

let lastTodayKey = todayKey();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || todayKey() === lastTodayKey) return;
  lastTodayKey = todayKey();
  initRange();
  renderFeed();
  renderToday();
  scrollToToday(false);
});

// ---------- in-app number numPad (main screen numbers never open the iPhone keyboard) ----------
function numField(block, onChange) {
  const btn = h('button', { class: 'val nf', 'aria-label': block.unit || 'Value' }, block.value || '');
  btn._block = block;
  btn._onChange = onChange;
  btn.addEventListener('click', () => openPad(btn));
  return btn;
}
let padField = null;
let padFresh = false;
const numPad = h('div', { class: 'numpad', hidden: true });
const padLabel = h('span', { class: 'np-label' });
function padKey(label, fn, cls = '') { return h('button', { class: `np-key ${cls}`, onclick: fn }, label); }
numPad.append(
  h('div', { class: 'np-top' }, padLabel, h('button', { class: 'np-done', 'aria-label': 'Hide keypad', onclick: () => closePad() }, '⌄')),
  h('div', { class: 'np-grid' },
    ...['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0'].map((d) => padKey(d, () => padType(d))),
    padKey('⌫', () => padBack(), 'np-back'),
    padKey('Next', () => padNext(), 'np-act np-next'),
    padKey('+ Row', () => padAddSet(), 'np-act'),
    padKey('Done', () => padMarkDone(), 'np-act ok')));
document.body.append(numPad);
function setPadValue(v) {
  const b = padField._block;
  b.value = v;
  padField.textContent = v;
  padField._onChange();
}
function padType(d) {
  if (!padField) return;
  const cur = padFresh ? '' : String(padField._block.value || '');
  padFresh = false;
  if (d === '.' && cur.includes('.')) return;
  if (cur.length >= 7) return;
  setPadValue(cur === '0' && d !== '.' ? d : cur + d);
}
function padBack() {
  if (!padField) return;
  padFresh = false;
  setPadValue(String(padField._block.value || '').slice(0, -1));
}
function padNext() {
  if (!padField) return;
  const day = padField.closest('.day');
  const all = day ? [...day.querySelectorAll('.nf')] : [];
  const next = all[all.indexOf(padField) + 1];
  if (next) openPad(next); else closePad();
}
// The exercise the keypad is currently typing into.
function padEntry() {
  const dayEl = padField && padField.closest('.day'), wrap = padField && padField.closest('.ex-wrap');
  const key = dayEl && dayEl.dataset.key, day = key && getDay(key);
  const entry = day && wrap && day.entries.find((e) => e.id === wrap.dataset.eid);
  return entry ? { key, entry, box: padField.closest('#today') || feedEl } : null;
}
function padAddSet() {
  const p = padEntry();
  if (!p) return;
  p.entry.sets.push(blankSpec(p.entry.sets[p.entry.sets.length - 1] || []));
  save();
  refreshDay(p.key);
  const sets = p.box.querySelectorAll(`.day[data-key="${p.key}"] .ex-wrap[data-eid="${p.entry.id}"] .set`);
  const first = sets.length && sets[sets.length - 1].querySelector('.nf');
  if (first) openPad(first);
}
function padMarkDone() {
  const p = padEntry();
  if (!p) return;
  p.entry.done = true;
  closePad();
  save();
  refreshDay(p.key);
}
function openPad(field) {
  clearTimeout(restoreTimer);
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  if (padField) padField.classList.remove('active');
  padField = field;
  padFresh = true;
  field.classList.add('active');
  padLabel.textContent = field._block.unit || '';
  numPad.hidden = false;
  document.body.classList.add('pad-open');
  // Fit the whole day (date to last exercise) between the top bar and the pad; if it's too tall, fit this exercise; else this field.
  requestAnimationFrame(() => {
    const top = topInset() + 8;
    const bottom = numPad.getBoundingClientRect().top - 12;
    const fr = field.getBoundingClientRect();
    const day = field.closest('.day');
    const ex = field.closest('.ex-wrap');
    const candidates = [day && day.getBoundingClientRect(), ex && ex.getBoundingClientRect(), fr].filter(Boolean);
    const box = candidates.find((r) => r.height <= bottom - top && r.top <= fr.top && r.bottom >= fr.bottom) || fr;
    let delta = 0;
    if (box.bottom > bottom) delta = box.bottom - bottom;
    if (box.top - delta < top) delta = box.top - top;
    if (Math.abs(delta) > 1) window.scrollBy({ top: delta, behavior: 'smooth' });
  });
}
function closePad() {
  if (padField) padField.classList.remove('active');
  padField = null;
  numPad.hidden = true;
  document.body.classList.remove('pad-open');
}
document.addEventListener('pointerdown', (e) => {
  if (!padField || numPad.contains(e.target) || e.target.closest('.nf')) return;
  closePad();
}, true);

// Tapping anywhere outside a text box closes the iPhone keyboard (no need for the ✓ bar button).
document.addEventListener('pointerdown', (e) => {
  const a = document.activeElement;
  if (!a || !/^(INPUT|TEXTAREA)$/.test(a.tagName)) return;
  // Inside sheets and on buttons, leave the keyboard alone: closing it mid-tap shifts the layout and the tap misses.
  if (e.target.closest('input, textarea, select, label, button, .sheet, .choice, [role="dialog"]')) return;
  a.blur();
}, true);

// ---------- start ----------
// The browser must not restore an old scroll position on reload (it lands on the top of the feed); we always center today.
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
let hiddenAt = 0;
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') { hiddenAt = Date.now(); return; }
  if (hiddenAt && Date.now() - hiddenAt > 120000 && logActive() && sheet.hidden && !padField) scrollToToday(false);
});
window.addEventListener('pageshow', (e) => { if (e.persisted && logActive()) scrollToToday(false); });
seedStarters();
applyTheme();
initRange();
renderFeed();
renderToday();
renderExercises();
renderProfile();
requestAnimationFrame(() => {
  scrollToToday(false);
  updateTitle();
  const watch = (id, fn) => new IntersectionObserver((items) => {
    if (items.some((i) => i.isIntersecting) && logActive() && sheet.hidden) fn();
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

const refreshDayBase = refreshDay;
refreshDay = (...args) => { const r = refreshDayBase(...args); if (todayTabActive()) syncWelcome(); renderTodayType(); if (todayTabActive() && !document.body.classList.contains("pad-open")) sizeTodayBox(); return r; };
try { if (localStorage.getItem('workouts.calMode') === 'grid') setCalMode('grid', true); } catch (_) {}
