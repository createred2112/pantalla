'use strict';
// Editor visual de cartela — rediseño completo (mismos contratos con el server).
//
// Principios:
//  - Lo que ves es lo que sale: el auto-ajuste se calcula UNA vez con las
//    fuentes cargadas; seleccionar no recalcula nada.
//  - Panel de capas: todos los elementos a la vista, aunque se tapen.
//  - Guías magnéticas: al arrastrar, imanta a márgenes, centros y bordes de
//    otros elementos (líneas rosas).
//  - Deshacer/Rehacer (Ctrl+Z / Ctrl+Y) para experimentar sin miedo.
//  - Tamaño real del texto SIEMPRE visible; modo tamaño fijo; caja al texto;
//    igualar/alinear respecto a otro elemento.
//
// El formato del layout guardado y los endpoints NO cambian.
const ID = new URLSearchParams(location.search).get('id');
const $ = (s) => document.querySelector(s);
const canvas = $('#canvas'), wrap = $('#canvasWrap'), stage = $('#stage');
let FRAME = null, ELS = [], SCALE = 1, SEL = -1;
let FONT_DISPLAY = "'Anton',sans-serif", FONT_TEXT = "'Oswald',sans-serif";

function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 1800); }
function mediaUrl(p) { return p ? '/media/' + p.replace('data/uploads/', 'uploads/').replace('data/worker-inbox/', 'inbox/') : ''; }
function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
async function requestJson(url, opts = {}, timeoutMs = 8000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { ...opts, signal: ctrl.signal });
    const data = await r.json().catch(() => ({}));
    if (r.status === 401) {
      location.href = '/login';
      throw new Error('La sesión ha caducado. Vuelve a entrar.');
    }
    if (!r.ok) throw new Error(data.error || 'No se pudo completar la acción.');
    return data;
  } catch (e) {
    if (e && e.name === 'AbortError') throw new Error('El servidor no ha respondido. No se ha cambiado nada.');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
async function withBusy(btn, label, fn) {
  const old = btn.textContent;
  btn.disabled = true;
  btn.textContent = label;
  try {
    return await fn();
  } finally {
    btn.disabled = false;
    btn.textContent = old;
  }
}

// ===== Historial (deshacer / rehacer) =====
let HIST = [], REDO = [], lastSnapKey = '';
function stateJson() { return JSON.stringify({ background: FRAME.background, elements: ELS }); }
function snapshot(key) {
  // Una misma interacción continua (teclear en un campo, un arrastre) solo
  // genera UNA entrada de historial.
  if (key && key === lastSnapKey) return;
  lastSnapKey = key || '';
  HIST.push(stateJson());
  if (HIST.length > 60) HIST.shift();
  REDO = [];
  undoButtons();
}
function restore(fromRedo) {
  const src = fromRedo ? REDO : HIST;
  const dst = fromRedo ? HIST : REDO;
  if (!src.length) return;
  dst.push(stateJson());
  const s = JSON.parse(src.pop());
  FRAME.background = s.background;
  FRAME.elements = s.elements;
  ELS = FRAME.elements;
  if (SEL >= ELS.length) SEL = -1;
  lastSnapKey = '';
  build(); layers(); panel();
  undoButtons();
}
function undoButtons() {
  $('#btnUndo').disabled = !HIST.length;
  $('#btnRedo').disabled = !REDO.length;
}
$('#btnUndo').addEventListener('click', () => restore(false));
$('#btnRedo').addEventListener('click', () => restore(true));

// ===== Carga =====
async function loadFonts() {
  try { const css = await (await fetch('/api/fontcss')).text(); const s = document.createElement('style'); s.textContent = css; document.head.appendChild(s); } catch {}
}
function applyFrame(frame) {
  FRAME = frame;
  ELS = FRAME.elements;
  if (SEL >= ELS.length) SEL = -1;
  FONT_DISPLAY = FRAME.fontDisplay || FONT_DISPLAY;
  FONT_TEXT = FRAME.fontText || FONT_TEXT;
  HIST = []; REDO = []; lastSnapKey = '';
  undoButtons();
  $('#hint').textContent = FRAME.template + ' · ' + FRAME.W + '×' + FRAME.H + (FRAME.designVersion ? ' · diseño ' + FRAME.designVersion : '');
  $('#scope').innerHTML = `Editando <b>${FRAME.hasOwnLayout ? 'esta cartela' : 'plantilla base'}</b> · tema <b>${FRAME.theme && FRAME.theme.key ? FRAME.theme.key : 'auto'}</b>`;
  fit(); build(); layers(); panel();
  // Reajuste único cuando las fuentes están listas: el tamaño que ves es el
  // definitivo y ya no cambia al hacer clic.
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => refitAll());
}
async function refreshFrame() {
  applyFrame(await requestJson('/api/frame/' + ID));
}
async function load() {
  const who = await fetch('/api/whoami').then((r) => r.json()).catch(() => null);
  if (who && who.simpleMode) {
    location.href = '/';
    return;
  }
  await loadFonts();
  try {
    await refreshFrame();
  } catch (e) {
    $('#hint').textContent = e.message || 'no se pudo cargar';
    toast($('#hint').textContent);
  }
}

function fit() {
  const base = Math.min((stage.clientWidth - 40) / FRAME.W, (stage.clientHeight - 40) / FRAME.H);
  const s = base * (typeof ZOOM === 'number' ? ZOOM : 1);
  SCALE = s;
  canvas.style.width = FRAME.W + 'px'; canvas.style.height = FRAME.H + 'px';
  canvas.style.transform = 'scale(' + s + ')';
  wrap.style.width = FRAME.W * s + 'px'; wrap.style.height = FRAME.H * s + 'px';
}

// ===== Lienzo =====
function build() {
  const bg = FRAME.background || {};
  if (bg.type === 'photo' && FRAME.photo) canvas.style.background = `#000 url('${mediaUrl(FRAME.photo)}') center/cover`;
  else canvas.style.background = bg.color || '#000';
  canvas.querySelectorAll('.el').forEach((n) => n.remove());
  ELS.forEach((el, i) => canvas.appendChild(renderEl(el, i)));
}

function renderEl(el, i) {
  const d = document.createElement('div');
  d.className = 'el' + (i === SEL ? ' sel' : '');
  d.dataset.idx = i;
  d.style.left = el.x + 'px'; d.style.top = el.y + 'px';
  if (el.type === 'chip') { d.style.width = 'auto'; d.style.height = 'auto'; }
  else { d.style.width = (el.w || 0) + 'px'; d.style.height = (el.h || 0) + 'px'; }
  if (el.hidden) d.style.opacity = 0.25;

  if (el.type === 'text') renderText(d, el);
  else if (el.type === 'chip') renderChip(d, el);
  else if (el.type === 'rect' || el.type === 'band') { d.style.background = el.gradient || el.color || '#000'; if (el.radius) d.style.borderRadius = el.radius + 'px'; }
  else if (el.type === 'svg') {
    d.innerHTML = el.svg || '';
    if (el.decorative) d.style.pointerEvents = 'none';
  }
  else if (el.type === 'logo') {
    d.style.display = 'flex';
    d.style.alignItems = 'center';
    d.style.justifyContent = el.src ? 'center' : 'flex-start';
    if (el.src) d.innerHTML = `<img src="${el.src}" style="width:100%;height:100%;object-fit:${el.fit || 'contain'};display:block">`;
    else {
      const span = document.createElement('div');
      span.textContent = el.text || '';
      span.style.fontFamily = el.font === 'display' ? FONT_DISPLAY : FONT_TEXT;
      span.style.fontWeight = el.weight || 900;
      span.style.color = el.color || '#fff';
      span.style.fontSize = (el.size || Math.max(18, (el.h || 80) * 0.56)) + 'px';
      span.style.lineHeight = 1;
      span.style.whiteSpace = 'nowrap';
      d.appendChild(span);
    }
  }
  else if (el.type === 'image') d.style.background = '#1a2a44';

  if (d.style.pointerEvents !== 'none') {
    d.addEventListener('pointerdown', (e) => startDrag(e, i));
    d.addEventListener('dblclick', () => {
      select(i);
      const inp = $('#panel [data-k="text"]');
      if (inp) { inp.focus(); inp.select(); }
    });
  }
  if (i === SEL) addHandles(d, el);
  return d;
}
function addHandles(d, el) {
  if (!d || !el || el.type === 'chip' || d.style.pointerEvents === 'none') return;
  for (const mode of ['se', 'e', 's']) {
    const h = document.createElement('div');
    h.className = 'handle ' + mode;
    h.addEventListener('pointerdown', (e) => startResize(e, +d.dataset.idx, mode));
    d.appendChild(h);
  }
}

function renderText(d, el) {
  d.style.display = 'flex';
  d.style.justifyContent = el.align === 'center' ? 'center' : el.align === 'right' ? 'flex-end' : 'flex-start';
  d.style.alignItems = el.valign === 'center' ? 'center' : el.valign === 'bottom' ? 'flex-end' : 'flex-start';
  const span = document.createElement('div');
  span.className = 'txt';
  span.textContent = el.transform === 'upper' ? (el.text || '').toUpperCase() : (el.text || '');
  span.style.fontFamily = el.font === 'display' ? FONT_DISPLAY : FONT_TEXT;
  span.style.fontWeight = el.weight || 700;
  span.style.color = el.color || '#fff';
  span.style.lineHeight = el.lineHeight || 1.05;
  if (el.letterSpacingEm) span.style.letterSpacing = el.letterSpacingEm + 'em';
  span.style.whiteSpace = (el.autofit && el.autofit.lines === 1) ? 'nowrap' : 'pre-wrap';
  span.style.wordBreak = 'break-word'; span.style.maxWidth = '100%';
  d.appendChild(span);
  if (el.autofit) requestAnimationFrame(() => { el._px = fitSpan(span, d, el.autofit); syncSizeInfo(el); });
  else { span.style.fontSize = (el.size || 40) + 'px'; el._px = el.size || 40; }
}
function renderChip(d, el) {
  const cs = el.size || 30;
  d.style.display = 'inline-flex'; d.style.alignItems = 'center';
  d.style.background = el.bg || '#000'; d.style.color = el.color || '#fff';
  d.style.fontFamily = FONT_TEXT; d.style.fontWeight = 700; d.style.fontSize = cs + 'px';
  d.style.letterSpacing = (el.letterSpacing != null ? el.letterSpacing : 2) + 'px';
  d.style.height = Math.round(cs * 1.9) + 'px'; d.style.padding = '0 ' + Math.round(cs * 0.6) + 'px';
  d.style.borderRadius = (el.radius != null ? el.radius : Math.round(cs * 0.35)) + 'px';
  d.style.textTransform = 'uppercase'; d.style.whiteSpace = 'nowrap';
  d.textContent = el.text || '';
  el._px = cs;
}
function fitSpan(span, box, af) {
  let lo = af.min, hi = af.max, best = af.min;
  while (lo <= hi) { const mid = (lo + hi) >> 1; span.style.fontSize = mid + 'px'; if (span.scrollWidth <= box.clientWidth && span.scrollHeight <= box.clientHeight) { best = mid; lo = mid + 1; } else hi = mid - 1; }
  span.style.fontSize = best + 'px';
  return best;
}
function refitAll() {
  canvas.querySelectorAll('.el').forEach((d) => {
    const el = ELS[+d.dataset.idx];
    if (!el || el.type !== 'text' || !el.autofit) return;
    const span = d.querySelector('.txt');
    if (span) { el._px = fitSpan(span, d, el.autofit); syncSizeInfo(el); }
  });
}
// Reconstruye SOLO un elemento (mantiene estable todo lo demás).
function rebuildOne(i) {
  const el = ELS[i];
  const div = canvas.querySelector(`.el[data-idx="${i}"]`);
  if (!div || !el) return;
  div.replaceWith(renderEl(el, i));
}

// ===== Capas =====
function elKind(el) {
  return { text: 'texto', chip: 'chip', rect: 'caja', band: 'banda', svg: 'icono', logo: 'logo', image: 'imagen' }[el.type] || el.type;
}
function elName(el, i) {
  const t = String(el.text || el.bind || '').trim();
  return t ? `“${t.slice(0, 26)}”` : `elemento ${i + 1}`;
}
function layers() {
  const box = $('#layers');
  const rows = ELS.map((el, i) => `
    <div class="lyr${i === SEL ? ' on' : ''}${el.hidden ? ' off' : ''}" data-i="${i}">
      <span class="k">${elKind(el)}</span>
      <span class="nm">${esc(elName(el, i))}</span>
      <button class="eye" data-eye="${i}" title="${el.hidden ? 'Mostrar' : 'Ocultar'}">${el.hidden ? '🚫' : '👁'}</button>
    </div>`).join('');
  box.innerHTML = `<h2>Elementos (clic para seleccionar)</h2>
    <div class="lyr${SEL < 0 ? ' on' : ''}" data-i="-1"><span class="k">fondo</span><span class="nm">Fondo de la cartela</span></div>${rows}`;
  box.querySelectorAll('.lyr').forEach((row) => row.addEventListener('click', (e) => {
    if (e.target.closest('[data-eye]')) return;
    select(+row.dataset.i);
  }));
  box.querySelectorAll('[data-eye]').forEach((btn) => btn.addEventListener('click', () => {
    const i = +btn.dataset.eye;
    snapshot('eye' + i + Date.now());
    ELS[i].hidden = !ELS[i].hidden;
    rebuildOne(i); layers(); if (i === SEL) panel();
  }));
}

// ===== Selección / arrastre / redimensión =====
// Seleccionar solo cambia el resaltado: NO se reconstruye el lienzo, así el
// auto-ajuste no se recalcula y el texto no cambia de tamaño al clicar.
function select(i) {
  SEL = i;
  lastSnapKey = '';
  canvas.querySelectorAll('.handle').forEach((n) => n.remove());
  canvas.querySelectorAll('.el').forEach((n) => n.classList.toggle('sel', +n.dataset.idx === i));
  if (i >= 0) addHandles(canvas.querySelector(`.el[data-idx="${i}"]`), ELS[i]);
  layers();
  panel();
}
canvas.addEventListener('pointerdown', (e) => { if (e.target === canvas) select(-1); });

// ZOOM (esencial en móvil): botones − / ajustar / +. Con zoom, el lienzo se
// desplaza con dos dedos o con la barra del escenario.
let ZOOM = 1;
function setZoom(z) {
  ZOOM = Math.max(1, Math.min(4, z));
  stage.style.overflow = ZOOM > 1 ? 'auto' : 'hidden';
  stage.style.justifyContent = ZOOM > 1 ? 'flex-start' : 'center';
  stage.style.alignItems = ZOOM > 1 ? 'flex-start' : 'center';
  fit();
  const zi = $('#zoomVal');
  if (zi) zi.textContent = Math.round(ZOOM * 100) + '%';
}
if ($('#btnZoomIn')) {
  $('#btnZoomIn').addEventListener('click', () => setZoom(ZOOM + 0.5));
  $('#btnZoomOut').addEventListener('click', () => setZoom(ZOOM - 0.5));
  $('#btnZoomFit').addEventListener('click', () => setZoom(1));
}

function elBox(el, i) {
  if (el.type === 'chip') {
    const d = canvas.querySelector(`.el[data-idx="${i}"]`);
    return { x: el.x, y: el.y, w: d ? d.offsetWidth : 0, h: d ? d.offsetHeight : 0 };
  }
  return { x: el.x, y: el.y, w: el.w || 0, h: el.h || 0 };
}

// Guías magnéticas: candidatos = márgenes y centro del lienzo + bordes y
// centros del resto de elementos visibles.
function snapTargets(skip) {
  const W = FRAME.W, H = FRAME.H, m = Math.round(W * 0.04);
  const xs = [m, Math.round(W / 2), W - m], ys = [Math.round(H * 0.05), Math.round(H / 2), H - Math.round(H * 0.05)];
  ELS.forEach((o, i) => {
    if (i === skip || o.hidden) return;
    const b = elBox(o, i);
    xs.push(b.x, Math.round(b.x + b.w / 2), b.x + b.w);
    ys.push(b.y, Math.round(b.y + b.h / 2), b.y + b.h);
  });
  return { xs, ys };
}
function snapAxis(edges, targets, threshold) {
  let best = null;
  for (const t of targets) for (const e of edges) {
    const delta = t - e;
    if (Math.abs(delta) <= threshold && (!best || Math.abs(delta) < Math.abs(best.delta))) best = { delta, at: t };
  }
  return best;
}
function clearGuides() { canvas.querySelectorAll('.guide').forEach((n) => n.remove()); }
function showGuide(kind, at) {
  const g = document.createElement('div');
  g.className = 'guide ' + kind;
  if (kind === 'gv') g.style.left = (at - 1) + 'px';
  else g.style.top = (at - 1) + 'px';
  canvas.appendChild(g);
}

// Arrastre TÁCTIL y de ratón (pointer events): funciona con el dedo en el
// móvil, que es donde se edita de verdad.
function startDrag(e, i) {
  e.preventDefault(); e.stopPropagation();
  if (SEL !== i) select(i);
  const el = ELS[i]; const sx = e.clientX, sy = e.clientY, ox = el.x, oy = el.y;
  const div = canvas.querySelector(`.el[data-idx="${i}"]`);
  try { div.setPointerCapture(e.pointerId); } catch {}
  const box = elBox(el, i);
  const targets = snapTargets(i);
  let took = false;
  function mv(ev) {
    ev.preventDefault();
    if (!took) { snapshot('drag' + i + ':' + sx + ',' + sy); took = true; }
    let nx = Math.round(ox + (ev.clientX - sx) / SCALE);
    let ny = Math.round(oy + (ev.clientY - sy) / SCALE);
    clearGuides();
    if (!ev.altKey) { // Alt = arrastre libre sin imán
      const th = Math.max(3, Math.round(6 / SCALE));
      const sX = snapAxis([nx, nx + Math.round(box.w / 2), nx + box.w], targets.xs, th);
      const sY = snapAxis([ny, ny + Math.round(box.h / 2), ny + box.h], targets.ys, th);
      if (sX) { nx += sX.delta; showGuide('gv', sX.at); }
      if (sY) { ny += sY.delta; showGuide('gh', sY.at); }
    }
    el.x = nx; el.y = ny;
    div.style.left = el.x + 'px'; div.style.top = el.y + 'px';
    syncXY();
  }
  function up() { clearGuides(); document.removeEventListener('pointermove', mv); document.removeEventListener('pointerup', up); document.removeEventListener('pointercancel', up); }
  document.addEventListener('pointermove', mv); document.addEventListener('pointerup', up); document.addEventListener('pointercancel', up);
}
function startResize(e, i, mode) {
  e.preventDefault(); e.stopPropagation();
  const el = ELS[i]; const sx = e.clientX, sy = e.clientY, ow = el.w, oh = el.h;
  const div = canvas.querySelector(`.el[data-idx="${i}"]`);
  try { e.target.setPointerCapture(e.pointerId); } catch {}
  let took = false;
  function mv(ev) {
    ev.preventDefault();
    if (!took) { snapshot('resize' + i + ':' + sx + ',' + sy); took = true; }
    if (mode !== 's') el.w = Math.max(20, Math.round(ow + (ev.clientX - sx) / SCALE));
    if (mode !== 'e') el.h = Math.max(20, Math.round(oh + (ev.clientY - sy) / SCALE));
    div.style.width = el.w + 'px'; div.style.height = el.h + 'px';
    const span = div.querySelector('.txt'); if (span && el.autofit) { el._px = fitSpan(span, div, el.autofit); syncSizeInfo(el); }
    syncWH();
  }
  function up() { document.removeEventListener('pointermove', mv); document.removeEventListener('pointerup', up); document.removeEventListener('pointercancel', up); }
  document.addEventListener('pointermove', mv); document.addEventListener('pointerup', up); document.addEventListener('pointercancel', up);
}

// Teclado: flechas mueven, Supr oculta, Ctrl+Z/Y historial.
document.addEventListener('keydown', (e) => {
  const typing = /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement && document.activeElement.tagName);
  if ((e.ctrlKey || e.metaKey) && !typing && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); restore(e.shiftKey); return; }
  if ((e.ctrlKey || e.metaKey) && !typing && (e.key === 'y' || e.key === 'Y')) { e.preventDefault(); restore(true); return; }
  if (SEL < 0 || typing) return;
  const el = ELS[SEL];
  if (e.key === 'Delete' || e.key === 'Backspace') {
    e.preventDefault();
    snapshot('del' + SEL + Date.now());
    el.hidden = !el.hidden;
    rebuildOne(SEL); layers(); panel();
    return;
  }
  const step = e.shiftKey ? 10 : 1;
  let moved = false;
  if (e.key === 'ArrowLeft') { el.x -= step; moved = true; }
  if (e.key === 'ArrowRight') { el.x += step; moved = true; }
  if (e.key === 'ArrowUp') { el.y -= step; moved = true; }
  if (e.key === 'ArrowDown') { el.y += step; moved = true; }
  if (!moved) return;
  e.preventDefault();
  snapshot('arrow' + SEL);
  const div = canvas.querySelector(`.el[data-idx="${SEL}"]`);
  if (div) { div.style.left = el.x + 'px'; div.style.top = el.y + 'px'; }
  syncXY();
});

// ===== Panel de propiedades =====
function num(label, val, on) { return `<label>${label}</label><input type="number" value="${Math.round(val || 0)}" data-k="${on}">`; }
function colorInput(label, val, key) { return `<label>${label}</label><input type="color" data-k="${key}" value="${hex(val)}">`; }
function roleOptions(selected, fixed) {
  const current = fixed ? '' : selected;
  const labels = { bg: 'Fondo del tema', bg2: 'Fondo 2', text: 'Texto', textMuted: 'Texto suave', accent: 'Acento', accentText: 'Texto sobre acento', logoAccent: 'Logo/acento' };
  return `<select class="role-select" data-k="colorRole">
    <option value="" ${!current ? 'selected' : ''}>Color fijo</option>
    ${Object.keys(labels).map((key) => `<option value="${key}" ${current === key ? 'selected' : ''}>${labels[key]}</option>`).join('')}
  </select>`;
}
function bgRoleOptions(selected, fixed) {
  const current = fixed ? '' : selected;
  return `<select class="role-select" data-k="backgroundRole">
    <option value="" ${!current ? 'selected' : ''}>Color fijo</option>
    <option value="bg" ${current === 'bg' ? 'selected' : ''}>Fondo del tema</option>
    <option value="bg2" ${current === 'bg2' ? 'selected' : ''}>Fondo 2</option>
    <option value="accent" ${current === 'accent' ? 'selected' : ''}>Acento</option>
  </select>`;
}
function sizeBlock(el) {
  if (el.type !== 'text') return el.type === 'chip' ? num('Tamaño', el.size, 'size') : '';
  let h = '<h2>Tamaño del texto</h2>';
  if (el.autofit) {
    h += `<div class="sizeinfo" id="sizeInfo">Tamaño real ahora: <b>${el._px || '…'} px</b></div>`;
    h += `<div class="row"><div>${num('Mínimo', el.autofit.min, 'afmin')}</div><div>${num('Máximo', el.autofit.max, 'afmax')}</div><div>${num('Líneas máx', el.autofit.lines || 1, 'aflines')}</div></div>`;
    h += `<div class="row" style="margin-top:8px"><div><button type="button" class="ghost wfull" data-tool="fixSize">Fijar tamaño (${el._px || '…'} px)</button></div><div><button type="button" class="ghost wfull" data-tool="shrinkBox">Caja al texto</button></div></div>`;
    h += `<div class="hint2">Auto-ajuste: el texto crece hasta llenar la caja o llegar al máximo. “Fijar tamaño” lo congela en px exactos. “Caja al texto” quita el espacio muerto de la caja.</div>`;
  } else {
    h += num('Tamaño (px exactos)', el.size, 'size');
    h += `<div class="row" style="margin-top:8px"><div><button type="button" class="ghost wfull" data-tool="autoSize">Volver a auto-ajuste</button></div><div><button type="button" class="ghost wfull" data-tool="shrinkBox">Caja al texto</button></div></div>`;
    h += `<div class="hint2">Tamaño fijo: lo que pongas es lo que sale. Si no cabe en la caja se recorta: agranda la caja o baja el número.</div>`;
  }
  return h;
}
function elementTools(el) {
  if (!el || el.type === 'chip') return '';
  return `<h2>Centrar en la pantalla</h2>
    <div class="toolgrid">
      <button type="button" class="ghost" data-tool="alignLeft">Izq</button>
      <button type="button" class="ghost" data-tool="centerX">Centro X</button>
      <button type="button" class="ghost" data-tool="alignRight">Der</button>
      <button type="button" class="ghost" data-tool="alignTop">Arriba</button>
      <button type="button" class="ghost" data-tool="centerY">Centro Y</button>
      <button type="button" class="ghost" data-tool="alignBottom">Abajo</button>
    </div>`;
}
function referenceTools(el) {
  if (!el) return '';
  const others = ELS.map((o, i) => ({ o, i })).filter(({ o, i }) => i !== SEL && !o.hidden && o.type !== 'svg');
  if (!others.length) return '';
  const isText = el.type === 'text' || el.type === 'chip';
  return `<h2>Respecto a otro elemento</h2>
    <select id="refPicker">${others.map(({ o, i }) => `<option value="${i}">${esc(elKind(o) + ' · ' + elName(o, i))}</option>`).join('')}</select>
    <div class="toolgrid" style="margin-top:6px">
      ${isText ? '<button type="button" class="ghost" data-ref="matchFont" title="Mismo tamaño de letra en px">= Tamaño txt</button>' : ''}
      <button type="button" class="ghost" data-ref="matchW">= Ancho</button>
      <button type="button" class="ghost" data-ref="matchH">= Alto</button>
      <button type="button" class="ghost" data-ref="alignL">Izq con</button>
      <button type="button" class="ghost" data-ref="alignCX">Centro X</button>
      <button type="button" class="ghost" data-ref="alignR">Der con</button>
      <button type="button" class="ghost" data-ref="alignT">Arriba</button>
      <button type="button" class="ghost" data-ref="alignCY">Centro Y</button>
      <button type="button" class="ghost" data-ref="alignB">Abajo</button>
    </div>`;
}
function panel() {
  const p = $('#panel');
  if (SEL < 0) {
    const bg = FRAME.background || {};
    p.innerHTML = `<h2>Fondo de la cartela</h2>${colorInput('Color de fondo', bg.color || '#000000', 'backgroundColor')}${bgRoleOptions(bg.colorTheme, bg.colorFixed)}
      <div class="hint2" style="margin-top:8px">“Rol del tema” = el color sigue a la paleta si cambias el tema de la cartela. “Color fijo” = se queda tal cual.</div>
      <div class="empty">Selecciona un elemento en el lienzo o en la lista de arriba.</div>`;
    wire(p);
    return;
  }
  const el = ELS[SEL];
  let h = `<h2>${elKind(el)}${el.bind ? ' · vinculado a ' + el.bind : ''}</h2>`;
  if (el.type === 'text' || el.type === 'chip') {
    h += `<label>Texto</label><input data-k="text" value="${(el.text || '').replace(/"/g, '&quot;')}">`;
    if (el.bind) h += `<div class="hint2">Vinculado a "${el.bind}": se actualiza solo con el dato de la cartela.</div>`;
    h += `<div class="row"><div><label>Fuente</label><select data-k="font"><option value="display"${el.font === 'display' ? ' selected' : ''}>Titular</option><option value="text"${el.font !== 'display' ? ' selected' : ''}>Texto</option></select></div><div><label>Peso</label><select data-k="weight"><option ${el.weight == 400 ? 'selected' : ''}>400</option><option ${el.weight == 600 ? 'selected' : ''}>600</option><option ${el.weight == 700 ? 'selected' : ''}>700</option><option ${el.weight == 800 ? 'selected' : ''}>800</option></select></div></div>`;
    h += `<div class="row"><div>${colorInput('Color texto', el.color, 'color')}${roleOptions(el.colorTheme, el.colorFixed)}</div><div><label>Alineación</label><select data-k="align"><option value="left"${el.align === 'left' ? ' selected' : ''}>Izq</option><option value="center"${el.align === 'center' ? ' selected' : ''}>Centro</option><option value="right"${el.align === 'right' ? ' selected' : ''}>Der</option></select><label>Interletra (em)</label><input type="number" step="0.01" value="${el.letterSpacingEm || 0}" data-k="letterSpacingEm"></div></div>`;
    if (el.type === 'chip') h += colorInput('Color de caja', el.bg || '#000000', 'bg') + roleOptions(el.bgTheme, el.bgFixed).replace('data-k="colorRole"', 'data-k="bgRole"');
    h += sizeBlock(el);
  }
  if (el.type === 'logo') {
    h += `<div class="hint2">Logo de esta cartela. Puedes moverlo y cambiar su tamaño. La imagen se cambia en Ajustes.</div>`;
  }
  if (el.type === 'rect' || el.type === 'band') h += colorInput('Color', el.color, 'color') + roleOptions(el.colorTheme, el.colorFixed);
  h += elementTools(el);
  h += referenceTools(el);
  h += `<h2>Posición y tamaño de la caja</h2><div class="row"><div>${num('X', el.x, 'x')}</div><div>${num('Y', el.y, 'y')}</div></div>`;
  if (el.type !== 'chip') h += `<div class="row"><div>${num('Ancho', el.w, 'w')}</div><div>${num('Alto', el.h, 'h')}</div></div>`;
  h += `<button class="ghost wfull" id="btnHide" style="margin-top:14px">${el.hidden ? 'Mostrar' : 'Ocultar'} elemento</button>`;
  p.innerHTML = h;
  wire(p);
  p.querySelectorAll('[data-tool]').forEach((btn) => btn.addEventListener('click', () => toolAction(btn.dataset.tool)));
  p.querySelectorAll('[data-ref]').forEach((btn) => btn.addEventListener('click', () => refAction(btn.dataset.ref)));
  const hide = $('#btnHide');
  if (hide) hide.addEventListener('click', () => { snapshot('hide' + SEL + Date.now()); el.hidden = !el.hidden; rebuildOne(SEL); layers(); panel(); });
}
function wire(p) {
  p.querySelectorAll('[data-k]').forEach((inp) => inp.addEventListener('input', () => apply(inp)));
}
function hex(c) { return (c && c[0] === '#') ? c.slice(0, 7) : '#ffffff'; }
function bindColor(target, colorKey, roleKey, fixedKey, value) {
  target[colorKey] = value;
  const token = themeTokenFor(value);
  if (token) {
    target[roleKey] = token;
    target[fixedKey] = false;
  } else {
    delete target[roleKey];
    target[fixedKey] = true;
  }
}
function setRole(target, colorKey, roleKey, fixedKey, token) {
  if (token && FRAME.theme && FRAME.theme[token]) {
    target[colorKey] = FRAME.theme[token];
    target[roleKey] = token;
    target[fixedKey] = false;
  } else {
    delete target[roleKey];
    target[fixedKey] = true;
  }
}
function toolAction(action) {
  if (SEL < 0) return;
  const el = ELS[SEL];
  snapshot('tool:' + action + ':' + SEL + ':' + Date.now());
  const margin = Math.round((FRAME.W || 1920) * 0.04);
  const W = FRAME.W || 1920;
  const H = FRAME.H || 1080;
  if (action === 'alignLeft') el.x = margin;
  if (action === 'alignRight') el.x = Math.max(0, W - margin - (el.w || 0));
  if (action === 'centerX') el.x = Math.round((W - (el.w || 0)) / 2);
  if (action === 'alignTop') el.y = margin;
  if (action === 'alignBottom') el.y = Math.max(0, H - margin - (el.h || 0));
  if (action === 'centerY') el.y = Math.round((H - (el.h || 0)) / 2);
  if (action === 'fixSize') {
    // Congela el tamaño ACTUAL medido: a partir de ahora es exacto en px.
    el._afBackup = el.autofit ? { ...el.autofit } : null;
    el.size = el._px || (el.autofit && el.autofit.max) || 40;
    delete el.autofit;
  }
  if (action === 'autoSize') {
    const base = el.size || 40;
    el.autofit = el._afBackup || { min: Math.max(12, Math.round(base * 0.5)), max: Math.round(base * 1.6), lines: 2 };
    delete el._afBackup;
  }
  if (action === 'shrinkBox') {
    // Encoge la caja al contenido real, manteniendo el anclaje visual del texto.
    const div = canvas.querySelector(`.el[data-idx="${SEL}"]`);
    const span = div && div.querySelector('.txt');
    if (span) {
      const pad = 4;
      const nw = Math.min(el.w, Math.ceil(span.scrollWidth) + pad);
      const nh = Math.min(el.h, Math.ceil(span.scrollHeight) + pad);
      if (el.align === 'right') el.x += (el.w - nw);
      else if (el.align === 'center') el.x += Math.round((el.w - nw) / 2);
      if (el.valign === 'bottom') el.y += (el.h - nh);
      else if (el.valign === 'center') el.y += Math.round((el.h - nh) / 2);
      el.w = nw; el.h = nh;
    }
  }
  rebuildOne(SEL);
  select(SEL);
}
function effectivePx(el) {
  if (!el) return null;
  if (el.type === 'chip') return el.size || 30;
  if (el.type !== 'text') return null;
  return el._px || el.size || (el.autofit && el.autofit.max) || null;
}
function refAction(action) {
  if (SEL < 0) return;
  const refIdx = +($('#refPicker') && $('#refPicker').value);
  const ref = ELS[refIdx];
  const el = ELS[SEL];
  if (!ref || !el) return;
  snapshot('ref:' + action + ':' + SEL + ':' + Date.now());
  const rb = elBox(ref, refIdx);
  if (action === 'matchFont') {
    const px = effectivePx(ref);
    if (!px) { toast('El elemento de referencia no tiene texto'); return; }
    if (el.type === 'chip') el.size = px;
    else if (el.autofit) { el.autofit.min = px; el.autofit.max = px; }
    else el.size = px;
    toast('Texto igualado a ' + px + ' px');
  }
  if (action === 'matchW') el.w = rb.w;
  if (action === 'matchH') el.h = rb.h;
  if (action === 'alignL') el.x = rb.x;
  if (action === 'alignR') el.x = rb.x + rb.w - (el.w || 0);
  if (action === 'alignCX') el.x = Math.round(rb.x + (rb.w - (el.w || 0)) / 2);
  if (action === 'alignT') el.y = rb.y;
  if (action === 'alignB') el.y = rb.y + rb.h - (el.h || 0);
  if (action === 'alignCY') el.y = Math.round(rb.y + (rb.h - (el.h || 0)) / 2);
  rebuildOne(SEL);
  select(SEL);
}
function apply(inp) {
  const k = inp.dataset.k, v = inp.value;
  if (k === 'backgroundColor' || k === 'backgroundRole') {
    snapshot('bg:' + k);
    FRAME.background = FRAME.background || { type: 'solid' };
    if (k === 'backgroundColor') bindColor(FRAME.background, 'color', 'colorTheme', 'colorFixed', v);
    else setRole(FRAME.background, 'color', 'colorTheme', 'colorFixed', v);
    build();
    if (SEL >= 0) select(SEL); else panel();
    return;
  }
  if (SEL < 0) return;
  const el = ELS[SEL];
  snapshot('input:' + k + ':' + SEL);
  if (k === 'afmin') el.autofit.min = +v;
  else if (k === 'afmax') el.autofit.max = +v;
  else if (k === 'aflines') el.autofit.lines = Math.max(1, Math.round(+v) || 1);
  else if (['x', 'y', 'w', 'h', 'size', 'weight'].includes(k)) el[k] = +v;
  else if (k === 'letterSpacingEm') el.letterSpacingEm = +v;
  else if (k === 'color') bindColor(el, 'color', 'colorTheme', 'colorFixed', v);
  else if (k === 'bg') bindColor(el, 'bg', 'bgTheme', 'bgFixed', v);
  else if (k === 'colorRole') {
    setRole(el, 'color', 'colorTheme', 'colorFixed', v);
    rebuildOne(SEL); select(SEL);
    return;
  }
  else if (k === 'bgRole') {
    setRole(el, 'bg', 'bgTheme', 'bgFixed', v);
    rebuildOne(SEL); select(SEL);
    return;
  }
  else {
    el[k] = v;
  }
  // renderEl marca la selección y añade las asas cuando i === SEL.
  rebuildOne(SEL);
  if (k === 'text') layers();
}
function syncXY() { const p = $('#panel'); const xi = p.querySelector('[data-k="x"]'), yi = p.querySelector('[data-k="y"]'); if (xi) xi.value = ELS[SEL].x; if (yi) yi.value = ELS[SEL].y; }
function syncWH() { const p = $('#panel'); const wi = p.querySelector('[data-k="w"]'), hi = p.querySelector('[data-k="h"]'); if (wi) wi.value = ELS[SEL].w; if (hi) hi.value = ELS[SEL].h; }
function syncSizeInfo(el) {
  if (SEL < 0 || ELS[SEL] !== el) return;
  const info = $('#sizeInfo');
  if (info) info.innerHTML = `Tamaño real ahora: <b>${el._px || '…'} px</b>`;
  const fixBtn = document.querySelector('[data-tool="fixSize"]');
  if (fixBtn) fixBtn.textContent = `Fijar tamaño (${el._px || '…'} px)`;
}

// Ver todas las cajas (para entender qué pisa a qué).
$('#chkBoxes').addEventListener('change', (e) => canvas.classList.toggle('boxes', e.target.checked));

// Cerrar el menú de plantilla al hacer clic fuera.
document.addEventListener('click', (e) => {
  const menu = $('#tplMenu');
  if (menu && menu.open && !menu.contains(e.target)) menu.open = false;
});

// ===== Guardar / restablecer (mismo contrato de siempre) =====
function sameColor(a, b) {
  return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
}
function themeTokenFor(value) {
  const theme = FRAME.theme || {};
  for (const key of ['bg', 'bg2', 'text', 'textMuted', 'accent', 'accentText', 'logoAccent']) {
    if (sameColor(value, theme[key])) return key;
  }
  return '';
}
function layoutPayload() {
  const bg = FRAME.background ? { type: FRAME.background.type, color: FRAME.background.color } : undefined;
  if (bg) {
    const bgToken = themeTokenFor(bg.color);
    if (FRAME.background.colorFixed) bg.colorFixed = true;
    else if (bgToken) bg.colorTheme = bgToken;
  }
  const elements = ELS.map((src) => {
    const el = { ...src };
    // Estado interno del editor: nunca se guarda.
    for (const key of Object.keys(el)) if (key[0] === '_') delete el[key];
    if (el.type === 'logo') { delete el.src; delete el.text; }
    const colorToken = themeTokenFor(el.color);
    const bgToken = themeTokenFor(el.bg);
    if (el.colorFixed) delete el.colorTheme;
    else if (colorToken) el.colorTheme = colorToken;
    if (el.bgFixed) delete el.bgTheme;
    else if (bgToken) el.bgTheme = bgToken;
    return el;
  });
  return { background: bg, elements };
}

async function renderSavedCard() {
  toast('Diseño guardado. Generando el MP4...');
  return requestJson('/api/cards/' + ID + '/render', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ force: true }),
  }, 180000);
}

$('#btnSave').addEventListener('click', async () => {
  const btn = $('#btnSave');
  try {
    await withBusy(btn, 'Guardando y generando...', async () => {
      await requestJson('/api/cards/' + ID + '/layout', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ layout: layoutPayload() }),
      });
      await renderSavedCard();
    });
    toast('Diseño guardado y MP4 actualizado');
  } catch (e) {
    toast(e.message || 'Error al guardar o generar');
  }
});
$('#btnDefault').addEventListener('click', async () => {
  const theme = FRAME.theme && FRAME.theme.key ? FRAME.theme.key : '';
  if (!confirm('¿Aplicar este diseño como PREDETERMINADO de la plantilla "' + FRAME.template + '" SOLO para el tema "' + theme + '"?')) return;
  const btn = $('#btnDefault');
  try {
    await withBusy(btn, 'Guardando y generando...', async () => {
      const layout = layoutPayload();
      await requestJson('/api/templates/' + FRAME.template + '/layout', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ theme, layout }) });
      await requestJson('/api/cards/' + ID + '/layout', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ layout }) });
      await renderSavedCard();
    });
    toast('Plantilla, cartela y MP4 actualizados');
  } catch (e) { toast(e.message || 'Error al guardar o generar'); }
});
// PLANTILLA PROPIA: esta composición pasa a ser una plantilla nueva con
// nombre, disponible en la galería (★) para cualquier cartela futura.
$('#btnSaveAsNew').addEventListener('click', async () => {
  const name = prompt('Nombre de la nueva plantilla (p. ej. "Póster evento grande"):');
  if (!name || !name.trim()) return;
  try {
    const base = String(FRAME.template || 'noticia').startsWith('u_') ? 'noticia' : FRAME.template;
    const r = await requestJson('/api/templates/custom', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label: name.trim(), baseTemplate: base, layout: layoutPayload(), theme: FRAME.theme && FRAME.theme.key }),
    });
    toast(`Plantilla «${name.trim()}» creada ✓ — ya está en la galería`);
  } catch (e) { toast(e.message || 'No se pudo crear la plantilla'); }
});

$('#btnDefaultAll').addEventListener('click', async () => {
  if (!confirm('¿Aplicar esta composición como PLANTILLA BASE para todos los colores de "' + FRAME.template + '"? Se borran excepciones de color de esa plantilla y los colores vinculados seguirán cambiando con cada tema.')) return;
  const btn = $('#btnDefaultAll');
  try {
    await withBusy(btn, 'Guardando y generando...', async () => {
      const layout = layoutPayload();
      await requestJson('/api/templates/' + FRAME.template + '/layout', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ theme: '', layout, clearThemes: true }) });
      await requestJson('/api/cards/' + ID + '/layout', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ layout }) });
      await renderSavedCard();
    });
    toast('Plantilla, cartela y MP4 actualizados');
  } catch (e) { toast(e.message || 'Error al guardar o generar'); }
});
$('#btnResetDefault').addEventListener('click', async () => {
  const theme = FRAME.theme && FRAME.theme.key ? FRAME.theme.key : '';
  if (!confirm('¿Borrar el diseño PREDETERMINADO de la plantilla "' + FRAME.template + '" SOLO para el tema "' + theme + '"? Las cartelas volverán al diseño sano de código.')) return;
  const r = await fetch('/api/templates/' + FRAME.template + '/layout?theme=' + encodeURIComponent(theme), { method: 'DELETE' });
  toast(r.ok ? 'Plantilla + color restablecida ✓' : 'Error');
  if (r.ok) setTimeout(() => location.reload(), 450);
});
$('#btnReset').addEventListener('click', async () => {
  if (!confirm('¿Volver al diseño por defecto de la plantilla? Se perderán los cambios de esta cartela.')) return;
  const btn = $('#btnReset');
  try {
    await withBusy(btn, 'Restableciendo...', () => requestJson('/api/cards/' + ID + '/layout', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ layout: null }),
    }));
    toast('Cartela restablecida sin regenerar ✓');
    await refreshFrame();
  } catch (e) {
    toast(e.message || 'No se pudo restablecer');
  }
});
window.addEventListener('resize', () => { fit(); });
load();
