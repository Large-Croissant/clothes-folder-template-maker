/* ============ Shirt Folder Template Maker ============ */
/* Core: state, controls, live SVG. Print/export lives in export.js */
'use strict';

const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const r2 = v => Math.round(v * 100) / 100;
const isNum = v => typeof v === 'number' && isFinite(v);

/* ---------- constants ---------- */
const PAGE_SIZES = {
  letter: { w: 8.5, h: 11 },
  a4:     { w: 8.27, h: 11.69 },
};
const PRINT_MARGIN = 0.35;      // inches reserved for printer margins
const UNIT_STEP = { in: 0.25, cm: 0.5 };
const DIM_MIN = 0.75, DIM_MAX = 40;

const PANELS = {
  center: { name: 'CENTER PANEL', short: 'C', tint: 'var(--c-center)' },
  left:   { name: 'LEFT FLAP',    short: 'L', tint: 'var(--c-left)' },
  right:  { name: 'RIGHT FLAP',   short: 'R', tint: 'var(--c-right)' },
  bottom: { name: 'BOTTOM FLAP',  short: 'B', tint: 'var(--c-bottom)' },
  bottom2:{ name: 'BOTTOM FLAP 2', short: 'B2', tint: 'var(--c-bottom2)' },
};

const PRESETS = {
  adult:   { label: 'Adult shirt',   center: { w: 9, h: 12 }, shirt: { chest: 18, length: 27 } },
  youth:   { label: 'Youth shirt',   center: { w: 7, h: 9 },  shirt: { chest: 13, length: 19 } },
  toddler: { label: 'Toddler shirt', center: { w: 5, h: 6 },  shirt: { chest: 10, length: 13 } },
};

/* ---------- state ---------- */
const LS_KEY = 'shirtFolderTemplateMaker.v1';

function defaultState() {
  return {
    version: 1,
    theme: 'dark',
    units: 'in',
    mode: 'auto',
    selected: 'center',
    links: { mirrorLR: true, equalBottoms: false, halfCenter: false, fullCenter: false },
    center: { w: 9, h: 12 },
    gap: 0.25,
    shirt: { chest: 18, length: 27 },
    flaps: {
      left:    { enabled: true,  w: 4.5, h: 12, linkH: true },
      right:   { enabled: true,  w: 4.5, h: 12, linkH: true },
      bottom:  { enabled: true,  w: 9,   h: 6.6, linkW: true },
      bottom2: { enabled: false, w: 9,   h: 3.2, linkW: true },
    },
    print: { paper: 'letter', orient: 'auto', layout: 'tile' },
    dpi: 150,
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return defaultState();
    const s = JSON.parse(raw), d = defaultState();
    return {
      ...d, ...s,
      links: { ...d.links, ...(s.links || {}) },
      center: { ...d.center, ...(s.center || {}) },
      shirt:  { ...d.shirt,  ...(s.shirt || {}) },
      print:  { ...d.print,  ...(s.print || {}) },
      flaps: {
        left:   { ...d.flaps.left,   ...(s.flaps?.left || {}) },
        right:  { ...d.flaps.right,  ...(s.flaps?.right || {}) },
        bottom: { ...d.flaps.bottom, ...(s.flaps?.bottom || {}) },
        bottom2:{ ...d.flaps.bottom2, ...(s.flaps?.bottom2 || {}) },
      },
    };
  } catch { return defaultState(); }
}

let state = loadState();

function save() { try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch {} }

/* ---------- units ---------- */
const toDisp = v => state.units === 'cm' ? v * 2.54 : v;
const fromDisp = v => state.units === 'cm' ? v / 2.54 : v;
const stepNow = () => UNIT_STEP[state.units];
const unitLabel = () => state.units === 'cm' ? 'cm' : 'in';

function trimNum(v, d) {
  let s = Number(v).toFixed(d);
  if (s.includes('.')) s = s.replace(/\.?0+$/, '');
  return s;
}
const fmt = v => trimNum(toDisp(v), state.units === 'cm' ? 1 : 2);

/* ---------- geometry ---------- */
function panelRects(s = state) {
  const { w: cw, h: ch } = s.center, g = s.gap;
  const rects = [{ id: 'center', x: 0, y: 0, w: cw, h: ch }];
  const f = s.flaps;
  if (f.left.enabled)   rects.push({ id: 'left',   x: -(g + f.left.w), y: 0, w: f.left.w,   h: f.left.h });
  if (f.right.enabled)  rects.push({ id: 'right',  x: cw + g,          y: 0, w: f.right.w,  h: f.right.h });
  if (f.bottom.enabled) rects.push({ id: 'bottom', x: (cw - f.bottom.w) / 2, y: ch + g, w: f.bottom.w, h: f.bottom.h });
  if (f.bottom.enabled && f.bottom2.enabled) {
    rects.push({
      id: 'bottom2',
      x: (cw - f.bottom2.w) / 2,
      y: ch + g + f.bottom.h + g,
      w: f.bottom2.w,
      h: f.bottom2.h,
    });
  }
  return rects;
}

function boundsOf(rects) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const r of rects) {
    minX = Math.min(minX, r.x);       minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.w); maxY = Math.max(maxY, r.y + r.h);
  }
  if (!isFinite(minX)) return { minX: 0, minY: 0, maxX: 1, maxY: 1, W: 1, H: 1 };
  return { minX, minY, maxX, maxY, W: maxX - minX, H: maxY - minY };
}

/* ---------- auto sizing & sync ---------- */
function applyAuto() {
  const { w: cw, h: ch } = state.center;
  const f = state.flaps, len = state.shirt.length;
  if (f.left.enabled)  { f.left.w = r2(cw / 2); f.left.h = ch; }
  if (f.right.enabled) { f.right.w = r2(cw / 2); f.right.h = ch; }

  if (f.bottom.enabled) {
    f.bottom.w = cw;
    const L = state.links;

    if (L.halfCenter) {
      // two equal folds, each half the center height (garment folds in half)
      f.bottom.h = r2(ch / 2);
      if (f.bottom2.enabled) f.bottom2.h = r2(ch / 2);
    } else if (L.fullCenter) {
      f.bottom.h = ch;
      if (f.bottom2.enabled) f.bottom2.h = ch;
    } else if (f.bottom2.enabled) {
      // double fold: two chained panels share the fabric below the center panel
      const reach = isNum(len) && len > ch ? (len - ch) : ch * 0.55;
      let b1, b2;
      if (L.equalBottoms) {
        const e = clamp(reach / 2, ch * 0.15, ch * 0.42);
        b1 = b2 = e;
      } else {
        b1 = clamp(reach * 0.65, ch * 0.25, ch * 0.45);
        b2 = clamp(reach * 0.35, ch * 0.18, ch * 0.30);
      }
      f.bottom.h = r2(b1);
      f.bottom2.h = r2(b2);
    } else {
      let bh = ch * 0.5;
      if (isNum(len) && len > ch) bh = clamp(len - ch, Math.max(1, ch * 0.25), ch * 0.55);
      f.bottom.h = r2(bh);
    }
    if (f.bottom2.enabled) f.bottom2.w = cw;
  }
}

function syncLinks() {
  const f = state.flaps, { w: cw, h: ch } = state.center;
  const L = state.links;
  for (const id of ['left', 'right']) {
    if (!f[id].enabled) continue;
    if (state.mode === 'manual' && f[id].linkH) f[id].h = ch;
  }
  for (const id of ['bottom', 'bottom2']) {
    if (!f[id].enabled) continue;
    if (state.mode === 'manual' && f[id].linkW) f[id].w = cw;
  }
  // derived fold depths (read-only while these links are on, in manual mode)
  if (state.mode === 'manual' && f.bottom.enabled) {
    if (L.halfCenter) {
      f.bottom.h = r2(ch / 2);
      if (f.bottom2.enabled) f.bottom2.h = r2(ch / 2);
    } else if (L.fullCenter) {
      f.bottom.h = ch;
      if (f.bottom2.enabled) f.bottom2.h = ch;
    }
  }
}

function sanitize() {
  state.center.w = clamp(state.center.w || 9, DIM_MIN, DIM_MAX);
  state.center.h = clamp(state.center.h || 12, DIM_MIN, DIM_MAX);
  state.gap = clamp(state.gap || 0, 0, 2);
  for (const k of ['chest', 'length']) {
    if (!isNum(state.shirt[k])) state.shirt[k] = null;
    else state.shirt[k] = clamp(state.shirt[k], 2, 80);
  }
  for (const id of ['left', 'right', 'bottom', 'bottom2']) {
    const f = state.flaps[id];
    f.enabled = !!f.enabled;
    f.w = clamp(f.w || 1, DIM_MIN, DIM_MAX);
    f.h = clamp(f.h || 1, DIM_MIN, DIM_MAX);
  }
  // flap 2 needs flap 1 to exist (chained hinge)
  if (!state.flaps.bottom.enabled) state.flaps.bottom2.enabled = false;
  // fold link flags + mutual exclusion for the derived fold depths
  for (const k of ['mirrorLR', 'equalBottoms', 'halfCenter', 'fullCenter']) {
    state.links[k] = !!state.links[k];
  }
  if (state.links.halfCenter && state.links.fullCenter) state.links.fullCenter = false;
  if (!PANELS[state.selected]) state.selected = 'center';
}

/* ---------- warnings ---------- */
function computeWarnings() {
  const ws = [];
  const chest = state.shirt.chest, len = state.shirt.length;
  const cw = state.center.w, ch = state.center.h;
  if (isNum(chest) && cw < chest / 2 - 1e-6) {
    ws.push(`Final width should be at least ${fmt(chest / 2)} ${unitLabel()} (half of your shirt's chest width) for the tidiest fold. Sleeve edges will still tuck under otherwise, but the fold gets bulky.`);
  }
  if (isNum(len) && ch * 2.3 < len - 1e-6) {
    ws.push(`Your shirt length (${fmt(len)} ${unitLabel()}) is much more than twice the final height — the hem will wrap well past the top edge. Fine for most shirts, but for a tidier fold use a final height of at least ${fmt(len / 2)} ${unitLabel()}.`);
  }
  return ws;
}

/* ---------- control building ---------- */
const fieldDefs = [];

function addField(container, opts) {
  // opts: { id, label, get, set, min, max, nullable, panel, dimKey, disabledFn, onHide }
  const wrap = document.createElement('div');
  wrap.className = 'field';
  wrap.innerHTML =
    `<label for="${opts.id}">${opts.label}</label>
     <span class="input-wrap">
       <input type="number" id="${opts.id}" inputmode="decimal" ${opts.nullable ? 'placeholder="—"' : ''}>
       <span class="unit-suffix"></span>
     </span>`;
  const input = wrap.querySelector('input');
  const suffix = wrap.querySelector('.unit-suffix');

  input.addEventListener('input', () => {
    const raw = input.value.trim();
    if (raw === '') {
      if (opts.nullable) { opts.set(null); changed(); }
      return;
    }
    let v = parseFloat(raw);
    if (!isFinite(v)) return;
    v = fromDisp(v);
    if (opts.min != null) v = Math.max(opts.min, v);
    if (opts.max != null) v = Math.min(opts.max, v);
    opts.set(v);
    changed();
  });
  if (opts.panel) {
    input.addEventListener('focus', () => { state.selected = opts.panel; renderAll(); });
  }
  container.appendChild(wrap);

  const def = {
    id: opts.id, input, suffix,
    refresh() {
      const v = opts.get();
      input.value = v == null ? '' : trimNum(toDisp(v), state.units === 'cm' ? 1 : 2);
      input.step = stepNow();
      input.min = opts.min != null ? trimNum(toDisp(opts.min), state.units === 'cm' ? 1 : 2) : '0';
      input.max = opts.max != null ? trimNum(toDisp(opts.max), state.units === 'cm' ? 1 : 2) : null;
      if (opts.disabledFn) input.disabled = opts.disabledFn();
      suffix.textContent = unitLabel();
    },
  };
  fieldDefs.push(def);
  return def;
}

function buildStaticFields() {
  addField($('#centerDims'), {
    id: 'centerW', label: 'Width', get: () => state.center.w, set: v => state.center.w = v,
    min: DIM_MIN, max: DIM_MAX, panel: 'center',
  });
  addField($('#centerDims'), {
    id: 'centerH', label: 'Height', get: () => state.center.h, set: v => state.center.h = v,
    min: DIM_MIN, max: DIM_MAX, panel: 'center',
  });

  addField($('#shirtDims'), {
    id: 'shirtChest', label: 'Chest width (laid flat)',
    get: () => state.shirt.chest, set: v => state.shirt.chest = v,
    min: 2, max: 80, nullable: true,
  });
  addField($('#shirtDims'), {
    id: 'shirtLen', label: 'Length (shoulder → hem)',
    get: () => state.shirt.length, set: v => state.shirt.length = v,
    min: 2, max: 80, nullable: true,
  });

  const gapRow = $('#gapRow');
  gapRow.classList.add('single');
  addField(gapRow, {
    id: 'gapField', label: 'Space between panels',
    get: () => state.gap, set: v => state.gap = v,
    min: 0, max: 2,
  });
}

function buildPanelRows() {
  const host = $('#panelRows');
  const isBottom = id => id === 'bottom' || id === 'bottom2';

  const mkRow = (id) => {
    const meta = PANELS[id];
    const row = document.createElement('div');
    row.className = 'panel-row';
    row.dataset.flap = id;
    row.style.setProperty('--tint', meta.tint);
    const note = id === 'bottom2'
      ? `<p class="row-note">For double up-folds (long shirts, towels, pants): fold flap 1 up, then this panel folds over it.</p>`
      : '';
    row.innerHTML =
      `<div class="panel-head">
         <label class="switch" title="Show / hide this panel">
           <input type="checkbox" data-flap-toggle="${id}" checked><span></span>
         </label>
         <span class="panel-title">${meta.name.toLowerCase().replace(' panel', ' panel')}</span>
         <span class="auto-badge">auto</span>
       </div>
       ${note}`;
    const dims = document.createElement('div');
    dims.className = 'dim-row';
    row.appendChild(dims);

    // setters that respect the panel links (mirror L/R, equal bottom folds)
    const setW = (v) => {
      state.flaps[id].w = v;
      if (state.links.mirrorLR && (id === 'left' || id === 'right')) {
        state.flaps[id === 'left' ? 'right' : 'left'].w = v;
      }
    };
    const setH = (v) => {
      state.flaps[id].h = v;
      if (state.links.mirrorLR && (id === 'left' || id === 'right')) {
        state.flaps[id === 'left' ? 'right' : 'left'].h = v;
      }
      if ((id === 'bottom' || id === 'bottom2') && state.mode === 'manual'
          && state.links.equalBottoms && state.flaps.bottom2.enabled) {
        state.flaps[id === 'bottom' ? 'bottom2' : 'bottom'].h = v;
      }
    };

    const fdW = addField(dims, {
      id: `flap-${id}-w`, label: 'Width',
      get: () => state.flaps[id].w, set: setW,
      min: DIM_MIN, max: DIM_MAX, panel: id,
      disabledFn: () => autoLocked(id, 'w'),
    });

    const fdH = addField(dims, {
      id: `flap-${id}-h`, label: 'Height',
      get: () => state.flaps[id].h, set: setH,
      min: DIM_MIN, max: DIM_MAX, panel: id,
      disabledFn: () => autoLocked(id, 'h'),
    });

    // link toggle on the dimension that follows the center panel
    const linkField = isBottom(id) ? fdW : fdH;
    const linkBtn = document.createElement('button');
    linkBtn.className = 'mini-link';
    linkBtn.type = 'button';
    linkBtn.title = isBottom(id) ? 'Follow center panel width' : 'Follow center panel height';
    linkBtn.textContent = '🔗';
    linkBtn.addEventListener('click', () => {
      const wasLinked = isBottom(id) ? !!state.flaps[id].linkW : !!state.flaps[id].linkH;
      if (isBottom(id)) state.flaps[id].linkW = !wasLinked;
      else state.flaps[id].linkH = !wasLinked;
      if (!wasLinked) { // just linked: snap to center size
        if (isBottom(id)) state.flaps[id].w = state.center.w;
        else state.flaps[id].h = state.center.h;
      }
      changed();
    });
    linkField.input.closest('.input-wrap').appendChild(linkBtn);

    $('.panel-head', row).addEventListener('click', (e) => {
      if (e.target.closest('.switch')) return;
      state.selected = id; renderAll();
    });

    row.querySelector('[data-flap-toggle]').addEventListener('change', (e) => {
      state.flaps[id].enabled = e.target.checked;
      if (id === 'bottom' && !e.target.checked) state.flaps.bottom2.enabled = false;
      if (id === 'bottom2' && e.target.checked) {
        state.flaps.bottom.enabled = true; // chained hinge needs flap 1
        if (state.mode === 'manual' && state.links.equalBottoms) {
          state.flaps.bottom2.h = state.flaps.bottom.h;
        }
      }
      if (state.mode === 'auto') applyAuto();
      changed();
    });

    host.appendChild(row);
    return row;
  };
  mkRow('left'); mkRow('right'); mkRow('bottom'); mkRow('bottom2');
}

function autoLocked(id, dimKey) {
  const f = state.flaps[id];
  if (state.mode === 'auto' || !f.enabled) return true;
  if (id === 'bottom2' && !state.flaps.bottom.enabled) return true;
  if ((id === 'bottom' || id === 'bottom2') && dimKey === 'h') {
    if (state.links.halfCenter || state.links.fullCenter) return true;
  }
  if ((id === 'bottom' || id === 'bottom2') && dimKey === 'w') return !!f.linkW;
  if (id !== 'bottom' && id !== 'bottom2' && dimKey === 'h') return !!f.linkH;
  return false;
}

/* ---------- rendering ---------- */
function applyTheme() {
  const light = state.theme === 'light';
  document.body.classList.toggle('light', light);
  const btn = $('#themeBtn');
  if (btn) {
    btn.textContent = light ? '🌙 Dark' : '☀️ Light';
    btn.title = light ? 'Switch to dark theme' : 'Switch to light theme';
  }
}

function refreshFields() {
  for (const f of fieldDefs) f.refresh();
  // link buttons state
  $$('.mini-link').forEach(btn => {
    const row = btn.closest('.panel-row');
    const id = row?.dataset.flap;
    if (!id) return;
    const f = state.flaps[id];
    const on = (id === 'bottom' || id === 'bottom2') ? f.linkW : f.linkH;
    btn.classList.toggle('on', !!on && state.mode === 'manual');
    btn.style.display = (state.mode === 'manual' && f.enabled) ? '' : 'none';
  });
}

function updateModeUI() {
  const auto = state.mode === 'auto';
  $$('#modeToggle button').forEach(b => b.classList.toggle('active', b.dataset.mode === state.mode));
  $('#modeHint').innerHTML = auto
    ? 'Flap sizes are computed from your final size (and your shirt info above). Switch to <b>Manual</b> to fine-tune anything.'
    : 'Every panel is hand-editable. Switch to <b>Auto-size</b> to recompute flaps from the final size.';
  $$('.panel-row').forEach(row => {
    const id = row.dataset.flap;
    const f = state.flaps[id];
    row.classList.toggle('auto', auto);
    row.classList.toggle('off', !f.enabled);
    row.classList.toggle('selected', state.selected === id);
    row.querySelector('[data-flap-toggle]').checked = f.enabled;
  });

  // panel-link toggles
  const L = state.links;
  const setLink = (sel, rowSel, val, enabled) => {
    const cb = $(sel);
    if (!cb) return;
    cb.checked = !!val;
    cb.disabled = !enabled;
    $(rowSel).classList.toggle('disabled', !enabled);
  };
  setLink('#linkMirror', '#linkRowMirror', L.mirrorLR, true);
  setLink('#linkEqual', '#linkRowEqual', L.equalBottoms, state.flaps.bottom2.enabled);
  setLink('#linkHalf', '#linkRowHalf', L.halfCenter, state.flaps.bottom.enabled);
  setLink('#linkFull', '#linkRowFull', L.fullCenter, state.flaps.bottom.enabled);
}

/* --- interactive SVG --- */
function n(v) { // number helper for svg output precision
  return trimNum(v, 3) || '0';
}

function dimsForPanel(r) {
  const out = [];
  const fs = clamp(Math.min(r.w, r.h) * 0.22, 0.09, 0.17);
  const wLabel = fmt(r.w), hLabel = fmt(r.h);
  // width dimension
  const wy = r.h < 0.95 ? r.y + r.h + 0.26 : r.y + 0.3;
  out.push(
    `<line x1="${n(r.x + 0.06)}" y1="${n(wy)}" x2="${n(r.x + r.w - 0.06)}" y2="${n(wy)}" class="dim"
      marker-start="url(#arw)" marker-end="url(#arw)"/>`,
    `<text x="${n(r.x + r.w / 2)}" y="${n(wy - 0.05)}" font-size="${n(fs)}" text-anchor="middle" class="dim-t">${wLabel}</text>`
  );
  // height dimension
  const hx = r.w < 0.95 ? r.x + r.w + 0.26 : r.x + 0.3;
  out.push(
    `<line x1="${n(hx)}" y1="${n(r.y + 0.06)}" x2="${n(hx)}" y2="${n(r.y + r.h - 0.06)}" class="dim"
      marker-start="url(#arw)" marker-end="url(#arw)"/>`,
    `<text x="${n(hx - 0.05)}" y="${n(r.y + r.h / 2)}" font-size="${n(fs)}" text-anchor="middle" class="dim-t"
      transform="rotate(-90 ${n(hx - 0.05)} ${n(r.y + r.h / 2)})">${hLabel}</text>`
  );
  return out.join('\n');
}

function hingeLines() {
  const { w: cw, h: ch } = state.center, g = state.gap, f = state.flaps;
  const out = [];
  if (f.left.enabled) {
    out.push(`<line x1="0" y1="0" x2="0" y2="${n(ch)}" class="hinge"/>`);
    out.push(`<line x1="${n(-g)}" y1="0" x2="${n(-g)}" y2="${n(f.left.h)}" class="hinge"/>`);
  }
  if (f.right.enabled) {
    out.push(`<line x1="${n(cw)}" y1="0" x2="${n(cw)}" y2="${n(ch)}" class="hinge"/>`);
    out.push(`<line x1="${n(cw + g)}" y1="0" x2="${n(cw + g)}" y2="${n(f.right.h)}" class="hinge"/>`);
  }
  if (f.bottom.enabled) {
    out.push(`<line x1="0" y1="${n(ch)}" x2="${n(cw)}" y2="${n(ch)}" class="hinge"/>`);
    const bx = (cw - f.bottom.w) / 2;
    out.push(`<line x1="${n(bx)}" y1="${n(ch + g)}" x2="${n(bx + f.bottom.w)}" y2="${n(ch + g)}" class="hinge"/>`);
    if (f.bottom2.enabled) {
      const by = ch + g + f.bottom.h;
      const bx2 = (cw - f.bottom2.w) / 2;
      out.push(`<line x1="${n(bx)}" y1="${n(by)}" x2="${n(bx + f.bottom.w)}" y2="${n(by)}" class="hinge"/>`);
      out.push(`<line x1="${n(bx2)}" y1="${n(by + g)}" x2="${n(bx2 + f.bottom2.w)}" y2="${n(by + g)}" class="hinge"/>`);
    }
  }
  return out.join('\n');
}

function draw() {
  const rects = panelRects();
  const b = boundsOf(rects);
  const m = 0.75;
  const parts = [];

  // grid (1 in spacing)
  const gx0 = Math.floor(b.minX - m), gx1 = Math.ceil(b.maxX + m);
  const gy0 = Math.floor(b.minY - m), gy1 = Math.ceil(b.maxY + m);
  for (let x = gx0; x <= gx1; x++)
    parts.push(`<line x1="${x}" y1="${gy0}" x2="${x}" y2="${gy1}" class="grid"/>`);
  for (let y = gy0; y <= gy1; y++)
    parts.push(`<line x1="${gx0}" y1="${y}" x2="${gx1}" y2="${y}" class="grid"/>`);

  parts.push(hingeLines());

  for (const r of rects) {
    const meta = PANELS[r.id];
    const sel = r.id === state.selected;
    const bigW = r.w > 1.25, bigH = r.h > 0.95;
    const fs = clamp(Math.min(r.w, r.h) * 0.2, 0.1, 0.2);
    const showName = bigW && bigH;
    const name = showName ? meta.name : meta.short;
    const nameFs = showName ? fs : clamp(fs, 0.09, 0.16);
    const nameY = showName ? r.y + r.h / 2 + fs * 0.35 : r.y + r.h / 2 + nameFs * 0.35;
    parts.push(
      `<g class="panel ${sel ? 'sel' : ''}" data-panel="${r.id}">
         <rect x="${n(r.x)}" y="${n(r.y)}" width="${n(r.w)}" height="${n(r.h)}" rx="0.07" class="panel-rect ${r.id}"/>
         <text x="${n(r.x + r.w / 2)}" y="${n(nameY)}" font-size="${n(nameFs)}" font-weight="600"
           letter-spacing="${n(showName ? 0.03 : 0)}" text-anchor="middle" class="name-t">${name}</text>
         ${dimsForPanel(r)}
       </g>`
    );
  }

  const vb = `${n(b.minX - m)} ${n(b.minY - m)} ${n(b.W + 2 * m)} ${n(b.H + 2 * m)}`;
  $('#canvasWrap').innerHTML =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" role="img" aria-label="Folding board preview">
      <defs>
        <marker id="arw" markerUnits="userSpaceOnUse" markerWidth="0.14" markerHeight="0.14"
          refX="0.12" refY="0.07" orient="auto-start-reverse">
          <path d="M0,0 L0.14,0.07 L0,0.14 z" class="dim-arrow"/>
        </marker>
      </defs>
      ${parts.join('\n')}
    </svg>`;
}

/* --- summary + warnings --- */
function renderSummary() {
  const rects = panelRects();
  const b = boundsOf(rects);
  const pages = estimatePages();
  const { w: cw, h: ch } = state.center;
  $('#summaryBox').innerHTML =
    `<h2>Summary</h2><div>
      <div class="sum-line"><span>Folded shirt size</span><b>${fmt(cw)} × ${fmt(ch)} ${unitLabel()}</b></div>
      <div class="sum-line"><span>Board opened flat</span><b>${fmt(b.W)} × ${fmt(b.H)} ${unitLabel()}</b></div>
      <div class="sum-line"><span>Print</span><b>${pages}</b></div>
     </div>`;
}

function renderWarnings() {
  const ws = computeWarnings();
  $('#warnings').innerHTML = ws.length
    ? ws.map(w => `<li>⚠️ ${w}</li>`).join('')
    : `<p class="ok">✓ No issues — ready to build.</p>`;
}

function renderAll() {
  applyTheme();
  refreshFields();
  updateModeUI();
  draw();
  renderSummary();
  renderWarnings();
  save();
}

/* ---------- global flow ---------- */
function changed() {
  sanitize();
  if (state.mode === 'auto') applyAuto();
  syncLinks();
  renderAll();
}

function setMode(m) {
  state.mode = m;
  changed();
}

function applyPreset(name) {
  const p = PRESETS[name];
  if (!p) return;
  state.center = { ...p.center };
  state.shirt = { ...p.shirt };
  state.gap = 0.25;
  for (const id of ['left', 'right', 'bottom']) state.flaps[id].enabled = true;
  state.mode = 'auto';
  changed();
}

/* ---------- static bindings ---------- */
function bindStatic() {
  $('#themeBtn').addEventListener('click', () => {
    state.theme = state.theme === 'light' ? 'dark' : 'light';
    changed();
  });

  const linkToggles = [
    ['#linkMirror', 'mirrorLR'],
    ['#linkEqual', 'equalBottoms'],
    ['#linkHalf', 'halfCenter'],
    ['#linkFull', 'fullCenter'],
  ];
  for (const [sel, key] of linkToggles) {
    $(sel).addEventListener('change', (e) => {
      state.links[key] = e.target.checked;
      if (key === 'halfCenter' && e.target.checked) state.links.fullCenter = false;
      if (key === 'fullCenter' && e.target.checked) state.links.halfCenter = false;
      if (key === 'mirrorLR' && e.target.checked) {
        state.flaps.right.w = state.flaps.left.w;
        state.flaps.right.h = state.flaps.left.h;
      }
      if (key === 'equalBottoms' && e.target.checked && state.flaps.bottom2.enabled) {
        state.flaps.bottom2.h = state.flaps.bottom.h;
      }
      changed();
    });
  }

  $$('#unitToggle button').forEach(b => b.addEventListener('click', () => {
    state.units = b.dataset.unit;
    changed();
  }));

  $$('#modeToggle button').forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));

  $$('.preset').forEach(b => b.addEventListener('click', () => applyPreset(b.dataset.preset)));

  $('#resetBtn').addEventListener('click', () => {
    try { localStorage.removeItem(LS_KEY); } catch {}
    state = defaultState();
    changed();
  });

  $('#canvasWrap').addEventListener('click', (e) => {
    const g = e.target.closest('[data-panel]');
    state.selected = g ? g.dataset.panel : null;
    renderAll();
  });

  $('#paperSize').value = state.print.paper;
  $('#paperOrient').value = state.print.orient;
  $('#printLayout').value = state.print.layout;
  $('#dpiSel').value = String(state.dpi);

  [['paperSize', v => state.print.paper = v],
   ['paperOrient', v => state.print.orient = v],
   ['printLayout', v => state.print.layout = v],
   ['dpiSel', v => state.dpi = parseInt(v, 10) || 150]]
    .forEach(([id, set]) => {
      const el = $('#' + id);
      el.addEventListener('change', () => { set(el.value); changed(); });
    });

  $('#printBtn').addEventListener('click', () => window.__printTemplate && window.__printTemplate());
  $('#svgBtn').addEventListener('click', () => window.__downloadSVG && window.__downloadSVG());
  $('#pngBtn').addEventListener('click', () => window.__downloadPNG && window.__downloadPNG());
  $('#cheatBtn').addEventListener('click', () => window.__openCheat && window.__openCheat());
}

/* ---------- estimator used by summary (shared impl in export.js) ---------- */
function estimatePages() {
  if (window.__estimatePages) return window.__estimatePages();
  const b = boundsOf(panelRects());
  const tw = b.W + 0.7, th = b.H + 1.7;
  if (state.print.layout === 'fit') return '1 page (scaled)';
  const page = PAGE_SIZES[state.print.paper];
  return Math.ceil(tw / (page.w - 2 * PRINT_MARGIN)) * Math.ceil(th / (page.h - 2 * PRINT_MARGIN)) + ' pages, true size';
}

/* ---------- init ---------- */
function init() {
  buildStaticFields();
  buildPanelRows();
  bindStatic();
  changed();
}

init();
