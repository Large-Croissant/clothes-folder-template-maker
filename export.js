/* ============ Shirt Folder Template Maker ============ */
/* Print, SVG/PNG export, page estimates, cheat-sheet modal. */
'use strict';

/* local helpers (no clashes with app.js globals) */
const q = (s, r = document) => r.querySelector(s);
const q$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const r3 = v => Number(v).toFixed(3).replace(/\.?0+$/, '') || '0';

/* ---------- shared print/export geometry ---------- */
function printableSize(paper, orient) {
  const p = PAGE_SIZES[paper];
  return orient === 'landscape'
    ? { pw: p.h - 2 * PRINT_MARGIN, ph: p.w - 2 * PRINT_MARGIN }
    : { pw: p.w - 2 * PRINT_MARGIN, ph: p.h - 2 * PRINT_MARGIN };
}

function templateBox() {
  // content box in inch-space: board + title/calibration strip (top) + bottom pad
  const b = boundsOf(panelRects());
  const padX = 0.35, topStrip = 1.35, botStrip = 0.35;
  return {
    x0: b.minX - padX, y0: b.minY - topStrip,
    x1: b.maxX + padX, y1: b.maxY + botStrip,
    tw: b.W + 2 * padX, th: b.H + topStrip + botStrip,
    b,
  };
}

function calibSizeIn() {
  // true-size square: 1 in (or 2.5 cm equivalent) — small enough to fit the print strip
  return state.units === 'cm' ? (2.5 / 2.54) : 1;
}

function chooseOrientation(tw, th) {
  if (state.print.orient !== 'auto') return state.print.orient;
  const a = printableSize(state.print.paper, 'portrait');
  const c = printableSize(state.print.paper, 'landscape');
  const pages = (s) => Math.ceil(tw / s.pw) * Math.ceil(th / s.ph);
  return pages(c) < pages(a) ? 'landscape' : 'portrait';
}

/* ---------- monochrome core content (panels + dims + hinges) ---------- */
function coreContent(uid) {
  const rects = panelRects();
  const { w: cw, h: ch } = state.center, g = state.gap;
  const parts = [];

  // hinge dashed lines
  const hinge = (x1, y1, x2, y2) =>
    parts.push(`<line x1="${r3(x1)}" y1="${r3(y1)}" x2="${r3(x2)}" y2="${r3(y2)}" stroke="#111" stroke-width="0.016" stroke-dasharray="0.07 0.07"/>`);

  if (state.flaps.left.enabled) {
    hinge(0, 0, 0, ch); hinge(-g, 0, -g, state.flaps.left.h);
  }
  if (state.flaps.right.enabled) {
    hinge(cw, 0, cw, ch); hinge(cw + g, 0, cw + g, state.flaps.right.h);
  }
  if (state.flaps.bottom.enabled) {
    hinge(0, ch, cw, ch);
    const bx = (cw - state.flaps.bottom.w) / 2;
    hinge(bx, ch + g, bx + state.flaps.bottom.w, ch + g);
    if (state.flaps.bottom2.enabled) {
      const by = ch + g + state.flaps.bottom.h;
      const bx2 = (cw - state.flaps.bottom2.w) / 2;
      hinge(bx, by, bx + state.flaps.bottom.w, by);
      hinge(bx2, by + g, bx2 + state.flaps.bottom2.w, by + g);
    }
  }

  // panels
  for (const r of rects) {
    const meta = PANELS[r.id];
    const bigW = r.w > 1.25, bigH = r.h > 0.95;
    const fs = clamp(Math.min(r.w, r.h) * 0.2, 0.1, 0.2);
    const showName = bigW && bigH;
    const name = showName ? meta.name : meta.short;
    const nameFs = showName ? fs : clamp(fs, 0.09, 0.16);
    const nameY = showName ? r.y + r.h / 2 + fs * 0.35 : r.y + r.h / 2 + nameFs * 0.35;
    const wLabel = fmt(r.w), hLabel = fmt(r.h);
    const dfs = clamp(Math.min(r.w, r.h) * 0.22, 0.09, 0.17);
    const wy = r.h < 0.95 ? r.y + r.h + 0.26 : r.y + 0.3;
    const hx = r.w < 0.95 ? r.x + r.w + 0.26 : r.x + 0.3;

    parts.push(
`<g>
  <rect x="${r3(r.x)}" y="${r3(r.y)}" width="${r3(r.w)}" height="${r3(r.h)}" rx="0.07" fill="#fff" stroke="#111" stroke-width="0.028"/>
  <text x="${r3(r.x + r.w / 2)}" y="${r3(nameY)}" font-size="${r3(nameFs)}" font-weight="600" letter-spacing="${r3(showName ? 0.03 : 0)}" text-anchor="middle" fill="#111" font-family="Segoe UI, system-ui, sans-serif">${name}</text>
  <line x1="${r3(r.x + 0.06)}" y1="${r3(wy)}" x2="${r3(r.x + r.w - 0.06)}" y2="${r3(wy)}" stroke="#333" stroke-width="0.014" marker-start="url(#${uid}a)" marker-end="url(#${uid}a)"/>
  <text x="${r3(r.x + r.w / 2)}" y="${r3(wy - 0.05)}" font-size="${r3(dfs)}" text-anchor="middle" fill="#333" font-family="Segoe UI, system-ui, sans-serif">${wLabel}</text>
  <line x1="${r3(hx)}" y1="${r3(r.y + 0.06)}" x2="${r3(hx)}" y2="${r3(r.y + r.h - 0.06)}" stroke="#333" stroke-width="0.014" marker-start="url(#${uid}a)" marker-end="url(#${uid}a)"/>
  <text x="${r3(hx - 0.05)}" y="${r3(r.y + r.h / 2)}" font-size="${r3(dfs)}" text-anchor="middle" fill="#333" font-family="Segoe UI, system-ui, sans-serif" transform="rotate(-90 ${r3(hx - 0.05)} ${r3(r.y + r.h / 2)})">${hLabel}</text>
</g>`);
  }
  return parts.join('\n');
}

function coreDefs(uid) {
  return `<defs>
    <marker id="${uid}a" markerUnits="userSpaceOnUse" markerWidth="0.14" markerHeight="0.14"
      refX="0.12" refY="0.07" orient="auto-start-reverse">
      <path d="M0,0 L0.14,0.07 L0,0.14 z" fill="#333"/>
    </marker>
  </defs>`;
}

function titleGroup(x, y) {
  const { w: cw, h: ch } = state.center;
  const bo = boundsOf(panelRects());
  const u = unitLabel();
  return `<g>
    <text x="${r3(x)}" y="${r3(y)}" font-size="0.18" font-weight="700" fill="#111" font-family="Segoe UI, system-ui, sans-serif">SHIRT FOLDER TEMPLATE</text>
    <text x="${r3(x)}" y="${r3(y + 0.28)}" font-size="0.12" fill="#111" font-family="Segoe UI, system-ui, sans-serif">final folded size ${fmt(cw)} × ${fmt(ch)} ${u}  ·  hinge gap ${fmt(state.gap)} ${u}  ·  opened flat ${fmt(bo.W)} × ${fmt(bo.H)} ${u}</text>
    <text x="${r3(x)}" y="${r3(y + 0.48)}" font-size="0.1" fill="#444" font-family="Segoe UI, system-ui, sans-serif">Cut along solid lines · dashed lines = folding hinges · print at 100% scale ("actual size") and verify the calibration square.</text>
  </g>`;
}

function calibGroup(x, y) {
  const c = calibSizeIn();
  const label = state.units === 'cm' ? '5 cm' : '2 in';
  return `<g>
    <rect x="${r3(x)}" y="${r3(y)}" width="${r3(c)}" height="${r3(c)}" fill="#fff" stroke="#111" stroke-width="0.03"/>
    <line x1="${r3(x)}" y1="${r3(y)}" x2="${r3(x + c)}" y2="${r3(y + c)}" stroke="#999" stroke-width="0.012" stroke-dasharray="0.05 0.05"/>
    <line x1="${r3(x + c)}" y1="${r3(y)}" x2="${r3(x)}" y2="${r3(y + c)}" stroke="#999" stroke-width="0.012" stroke-dasharray="0.05 0.05"/>
    <text x="${r3(x)}" y="${r3(y + c + 0.24)}" font-size="0.11" fill="#111" font-family="Segoe UI, system-ui, sans-serif">Calibration square — measure it: exactly ${label} × ${label}. If it prints differently, adjust printer scaling.</text>
  </g>`;
}

function crossMarks(ox, oy, pw, ph) {
  const pts = [
    [ox, oy], [ox + pw / 2, oy], [ox + pw, oy],
    [ox, oy + ph / 2], [ox + pw, oy + ph / 2],
    [ox, oy + ph], [ox + pw / 2, oy + ph], [ox + pw, oy + ph],
  ];
  const L = 0.18;
  return pts.map(([x, y]) =>
    `<line x1="${r3(x - L)}" y1="${r3(y)}" x2="${r3(x + L)}" y2="${r3(y)}" stroke="#111" stroke-width="0.012"/>
     <line x1="${r3(x)}" y1="${r3(y - L)}" x2="${r3(x)}" y2="${r3(y + L)}" stroke="#111" stroke-width="0.012"/>`
  ).join('\n');
}

/* ---------- print document builders ---------- */
function tilePages() {
  const box = templateBox();
  const orient = chooseOrientation(box.tw, box.th);
  const { pw, ph } = printableSize(state.print.paper, orient);
  const nx = Math.max(1, Math.ceil((box.tw - 1e-9) / pw));
  const ny = Math.max(1, Math.ceil((box.th - 1e-9) / ph));
  const spareX = nx * pw - box.tw, spareY = ny * ph - box.th;
  const startX = box.x0 - spareX / 2, startY = box.y0 - spareY / 2;
  const total = nx * ny;
  if (total > 24) return { docs: [], error: `Template needs ${total} pages — too many. Try "Fit on one page" or a smaller board.`, pw, ph };

  const docs = [];
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const ox = startX + i * pw, oy = startY + j * ph;
      const uid = `t${j}${i}_`;
      const first = i === 0 && j === 0;
      const svg =
`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${r3(ox)} ${r3(oy)} ${r3(pw)} ${r3(ph)}" width="${r3(pw)}in" height="${r3(ph)}in">
${coreDefs(uid)}
<clipPath id="${uid}clip"><rect x="${r3(ox)}" y="${r3(oy)}" width="${r3(pw)}" height="${r3(ph)}"/></clipPath>
<g clip-path="url(#${uid}clip)">${coreContent(uid)}</g>
${first ? titleGroup(box.x0, box.y0 + 0.35) : ''}
${first ? calibGroup(box.x1 - calibSizeIn() - 0.05, box.y0 + 0.02) : ''}
${crossMarks(ox, oy, pw, ph)}
<text x="${r3(ox + 0.08)}" y="${r3(oy + ph - 0.12)}" font-size="0.095" fill="#555" font-family="Segoe UI, system-ui, sans-serif">tile ${j * nx + i + 1} / ${total} — align crop marks when taping pages together</text>
</svg>`;
      docs.push(`<div class="print-page">${svg}</div>`);
    }
  }
  return { docs, orient, pw, ph };
}

function fitPage() {
  const box = templateBox();
  const orient = chooseOrientation(box.tw, box.th);
  const { pw, ph } = printableSize(state.print.paper, orient);
  const cal = calibSizeIn();
  const calBlockH = cal + 0.85;
  const availH = ph - calBlockH;
  const s = Math.min((pw - 0.2) / box.tw, availH / box.th);
  const tw2 = box.tw * s, th2 = box.th * s;
  const tx = (pw - tw2) / 2 - box.x0 * s, ty = (availH - th2) / 2 - box.y0 * s;
  const uid = 'fit_';
  const pct = Math.round(s * 100);
  const svg =
`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${r3(pw)} ${r3(ph)}" width="${r3(pw)}in" height="${r3(ph)}in">
${coreDefs(uid)}
<rect x="0" y="0" width="${r3(pw)}" height="${r3(ph)}" fill="#fff"/>
<g transform="translate(${r3(tx)},${r3(ty)}) scale(${r3(s)})">${coreContent(uid)}${titleGroup(box.x0, box.y0 + 0.35)}</g>
<text x="${r3(0.15)}" y="${r3(ph - calBlockH + 0.28)}" font-size="0.12" fill="#111" font-family="Segoe UI, system-ui, sans-serif">Printed at ${pct}% of true size — use a ruler on the calibration square (true size) to scale measurements when tracing.</text>
${calibGroup(pw - cal - 0.15, ph - cal - 0.15)}
</svg>`;
  return { docs: [`<div class="print-page">${svg}</div>`], orient, pw, ph, pct };
}

function injectPageStyle(orient) {
  const p = PAGE_SIZES[state.print.paper];
  const dims = orient === 'landscape' ? `${r3(p.h)}in ${r3(p.w)}in` : `${r3(p.w)}in ${r3(p.h)}in`;
  let el = q('#printPageStyle');
  if (!el) {
    el = document.createElement('style');
    el.id = 'printPageStyle';
    document.head.appendChild(el);
  }
  el.textContent = `@page { size: ${dims}; margin: ${PRINT_MARGIN}in; }`;
}

function printTemplate() {
  const res = state.print.layout === 'fit' ? fitPage() : tilePages();
  if (res.error) {
    alert(res.error + '\nSwitching to "Fit on one page" for this print.');
    const fb = fitPage();
    injectPageStyle(fb.orient);
    q('#printRoot').innerHTML = fb.docs.join('');
    window.print();
    return;
  }
  injectPageStyle(res.orient);
  q('#printRoot').innerHTML = res.docs.join('');
  window.print();
}

/* ---------- standalone SVG export ---------- */
function buildExportSVG() {
  const box = templateBox();
  const cal = calibSizeIn();
  const y1 = box.y1 + cal + 0.45; // room for calibration square below board
  const uid = 'exp_';
  const svg =
`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${r3(box.x0)} ${r3(box.y0)} ${r3(box.tw)} ${r3(y1 - box.y0)}" width="${r3(box.tw)}in" height="${r3(y1 - box.y0)}in">
${coreDefs(uid)}
<rect x="${r3(box.x0)}" y="${r3(box.y0)}" width="${r3(box.tw)}" height="${r3(y1 - box.y0)}" fill="#fff"/>
${coreContent(uid)}
${titleGroup(box.x0, box.y0 + 0.35)}
${calibGroup(box.x0 + 0.05, box.y1 + 0.1)}
</svg>`;
  return { svg, wIn: box.tw, hIn: y1 - box.y0 };
}

function downloadBlob(name, blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

function downloadSVG() {
  const { svg } = buildExportSVG();
  downloadBlob('shirt-folder-template.svg', new Blob([svg], { type: 'image/svg+xml' }));
}

async function downloadPNG() {
  const { svg, wIn, hIn } = buildExportSVG();
  const dpi = state.dpi || 150;
  const rawW = wIn * dpi, rawH = hIn * dpi;
  const scale = Math.min(1, 8000 / rawW, 8000 / rawH);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(rawW * scale);
  canvas.height = Math.round(rawH * scale);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const img = new Image();
  await new Promise((ok, err) => {
    img.onload = ok;
    img.onerror = err;
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  });
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  canvas.toBlob(b => downloadBlob('shirt-folder-template.png', b), 'image/png');
}

/* ---------- page estimate (used by sidebar summary) ---------- */
function estimatePages() {
  const box = templateBox();
  if (state.print.layout === 'fit') return '1 page (scaled)';
  const orient = chooseOrientation(box.tw, box.th);
  const { pw, ph } = printableSize(state.print.paper, orient);
  const n = Math.ceil((box.tw - 1e-9) / pw) * Math.ceil((box.th - 1e-9) / ph);
  return `${n} pages, true size (${unitLabel()})`;
}

/* ---------- cheat sheet ---------- */
function fracIn(v) {
  const f8 = v % 1;
  const map = { 0: '', 0.125: '⅛', 0.25: '¼', 0.375: '⅜', 0.5: '½', 0.625: '⅝', 0.75: '¾', 0.875: '⅞' };
  const near = Object.keys(map).find(k => Math.abs(f8 - Number(k)) < 0.061);
  if (near === undefined) return v.toFixed(2);
  const whole = Math.floor(v + 1e-9);
  if (Number(near) === 0) return String(whole);
  return whole ? `${whole}${map[near]}` : map[near];
}

function fmtPlain(v) {
  if (state.units === 'cm') return `${fmt(v)} cm`;
  const s = fmt(v);
  return `${s} in${s.includes('.') || true ? '' : ''}`.trim();
}

function buildCheatText() {
  const { w: cw, h: ch } = state.center;
  const b = boundsOf(panelRects());
  const u = unitLabel();
  const L = [];
  L.push('SHIRT FOLDER TEMPLATE — CHEAT SHEET');
  L.push('===================================');
  L.push(`Generated: ${new Date().toLocaleString()}`);
  L.push('');
  L.push(`FINAL FOLDED SHIRT SIZE : ${fmt(cw)} × ${fmt(ch)} ${u}  (= center panel)`);
  L.push(`HINGE GAP               : ${fmt(state.gap)} ${u}`);
  L.push(`BOARD OPENED FLAT        : ${fmt(b.W)} × ${fmt(b.H)} ${u}`);
  L.push('');
  L.push('PANELS (width × height)');
  for (const r of panelRects()) {
    const meta = PANELS[r.id];
    let extra = '';
    if (state.units === 'in') extra = `  (≈ ${fracIn(r.w)} × ${fracIn(r.h)} in)`;
    L.push(`  ${meta.name.padEnd(14)}: ${fmt(r.w)} × ${fmt(r.h)} ${u}${extra}`);
  }
  L.push('');
  L.push('ORDER OF USE');
  L.push('  1. Lay shirt face-down on the CENTER panel.');
  L.push('  2. Fold LEFT and RIGHT flaps in over the shirt.');
  if (state.flaps.bottom2.enabled) {
    L.push('  3. Fold the BOTTOM flap up.');
    L.push('  4. Fold BOTTOM FLAP 2 up and over it (double fold). Done.');
  } else {
    L.push('  3. Fold the BOTTOM flap up. Done.');
  }
  const ws = computeWarnings();
  if (ws.length) {
    L.push('');
    L.push('WARNINGS');
    ws.forEach(w => L.push(`  - ${w.replace(/<[^>]+>/g, '')}`));
  }
  L.push('');
  L.push('Cut panels from sturdy cardboard / foam board. Tape cloth or packing');
  L.push('tape across each hinge gap so the flaps fold both ways.');
  return L.join('\n');
}

function openCheat() {
  q('#cheatPre').textContent = buildCheatText();
  q('#cheatModal').classList.remove('hidden');
  q('#cheatCopy').focus();
}

/* ---------- wiring ---------- */
function initExport() {
  window.__printTemplate = printTemplate;
  window.__downloadSVG = downloadSVG;
  window.__downloadPNG = downloadPNG;
  window.__openCheat = openCheat;
  window.__estimatePages = estimatePages;
  window.__debugExport = { buildExportSVG, tilePages, fitPage, templateBox, printableSize, chooseOrientation };

  q('#cheatClose').addEventListener('click', () => q('#cheatModal').classList.add('hidden'));
  q('#cheatModal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) q('#cheatModal').classList.add('hidden');
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') q('#cheatModal').classList.add('hidden');
  });
  q('#cheatCopy').addEventListener('click', async () => {
    const text = buildCheatText();
    try {
      await navigator.clipboard.writeText(text);
      q('#cheatCopy').textContent = 'Copied ✓';
      setTimeout(() => (q('#cheatCopy').textContent = 'Copy to clipboard'), 1500);
    } catch {
      const sel = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(q('#cheatPre'));
      sel.removeAllRanges();
      sel.addRange(range);
      document.execCommand('copy');
      q('#cheatCopy').textContent = 'Copied ✓';
      setTimeout(() => (q('#cheatCopy').textContent = 'Copy to clipboard'), 1500);
    }
  });

  // populate print root for Ctrl+P too
  window.addEventListener('beforeprint', () => {
    if (!q('#printRoot').innerHTML.trim()) printTemplateSilent();
  });
  function printTemplateSilent() {
    const box = templateBox();
    const orient = chooseOrientation(box.tw, box.th);
    const res = state.print.layout === 'fit' ? fitPage() : tilePages();
    if (res.error) {
      const fb = fitPage();
      injectPageStyle(fb.orient);
      q('#printRoot').innerHTML = fb.docs.join('');
      return;
    }
    injectPageStyle(res.orient);
    q('#printRoot').innerHTML = res.docs.join('');
  }
}

initExport();
