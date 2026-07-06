'use strict';
// Editor visual de cartela (F2b). Carga el frame resuelto, lo pinta a escala,
// permite seleccionar/arrastrar/redimensionar y editar propiedades, y guarda el
// layout (overrides) de la cartela.
const ID = new URLSearchParams(location.search).get('id');
const $ = (s) => document.querySelector(s);
const canvas = $('#canvas'), wrap = $('#canvasWrap'), stage = $('#stage');
let FRAME = null, ELS = [], SCALE = 1, SEL = -1;
let FONT_DISPLAY = "'Anton',sans-serif", FONT_TEXT = "'Oswald',sans-serif";

function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 1800); }
function mediaUrl(p) { return p ? '/media/' + p.replace('data/uploads/', 'uploads/').replace('data/worker-inbox/', 'inbox/') : ''; }

async function loadFonts() {
  try { const css = await (await fetch('/api/fontcss')).text(); const s = document.createElement('style'); s.textContent = css; document.head.appendChild(s); } catch {}
}
async function load() {
  const who = await fetch('/api/whoami').then((r) => r.json()).catch(() => null);
  if (who && who.simpleMode) {
    location.href = '/';
    return;
  }
  await loadFonts();
  const r = await fetch('/api/frame/' + ID);
  if (!r.ok) { if (r.status === 401) location.href = '/login'; $('#hint').textContent = 'no se pudo cargar'; return; }
  FRAME = await r.json();
  ELS = FRAME.elements;
  FONT_DISPLAY = FRAME.fontDisplay || FONT_DISPLAY;
  FONT_TEXT = FRAME.fontText || FONT_TEXT;
  $('#hint').textContent = FRAME.template + ' · ' + FRAME.W + '×' + FRAME.H;
  $('#scope').innerHTML = `Editando <b>${FRAME.hasOwnLayout ? 'esta cartela' : 'plantilla base'}</b> · tema <b>${FRAME.theme && FRAME.theme.key ? FRAME.theme.key : 'auto'}</b>`;
  if (FRAME.template === 'agenda') {
    $('#btnDefault').disabled = true;
    $('#btnResetDefault').disabled = true;
    $('#btnDefault').title = 'Agenda cambia mucho segun tenga horas o solo frases. Guarda el diseno solo en esta cartela.';
    $('#btnDefault').textContent = 'Predeterminado bloqueado';
  }
  fit(); build();
}

function fit() {
  const s = Math.min((stage.clientWidth - 40) / FRAME.W, (stage.clientHeight - 40) / FRAME.H);
  SCALE = s;
  canvas.style.width = FRAME.W + 'px'; canvas.style.height = FRAME.H + 'px';
  canvas.style.transform = 'scale(' + s + ')';
  wrap.style.width = FRAME.W * s + 'px'; wrap.style.height = FRAME.H * s + 'px';
}

function build() {
  // Fondo.
  const bg = FRAME.background || {};
  if (bg.type === 'photo' && FRAME.photo) canvas.style.background = `#000 url('${mediaUrl(FRAME.photo)}') center/cover`;
  else canvas.style.background = bg.color || '#000';
  // Elementos.
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

  if (d.style.pointerEvents !== 'none') d.addEventListener('mousedown', (e) => startDrag(e, i));
  if (i === SEL && el.type !== 'chip' && d.style.pointerEvents !== 'none') { const h = document.createElement('div'); h.className = 'handle'; h.addEventListener('mousedown', (e) => startResize(e, i)); d.appendChild(h); }
  return d;
}

function renderText(d, el) {
  d.style.display = 'flex';
  d.style.justifyContent = el.align === 'center' ? 'center' : el.align === 'right' ? 'flex-end' : 'flex-start';
  d.style.alignItems = el.valign === 'center' ? 'center' : el.valign === 'bottom' ? 'flex-end' : 'flex-start';
  const span = document.createElement('div');
  span.textContent = el.transform === 'upper' ? (el.text || '').toUpperCase() : (el.text || '');
  span.style.fontFamily = el.font === 'display' ? FONT_DISPLAY : FONT_TEXT;
  span.style.fontWeight = el.weight || 700;
  span.style.color = el.color || '#fff';
  span.style.lineHeight = el.lineHeight || 1.05;
  if (el.letterSpacingEm) span.style.letterSpacing = el.letterSpacingEm + 'em';
  span.style.whiteSpace = (el.autofit && el.autofit.lines === 1) ? 'nowrap' : 'pre-wrap';
  span.style.wordBreak = 'break-word'; span.style.maxWidth = '100%';
  d.appendChild(span);
  if (el.autofit) requestAnimationFrame(() => fitSpan(span, d, el.autofit));
  else span.style.fontSize = (el.size || 40) + 'px';
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
}
function fitSpan(span, box, af) {
  let lo = af.min, hi = af.max, best = af.min;
  while (lo <= hi) { const mid = (lo + hi) >> 1; span.style.fontSize = mid + 'px'; if (span.scrollWidth <= box.clientWidth && span.scrollHeight <= box.clientHeight) { best = mid; lo = mid + 1; } else hi = mid - 1; }
  span.style.fontSize = best + 'px';
}

// --- Selección / arrastre / redimensión ---
function select(i) { SEL = i; build(); panel(); }
function startDrag(e, i) {
  e.preventDefault(); e.stopPropagation();
  if (SEL !== i) select(i);
  const el = ELS[i]; const sx = e.clientX, sy = e.clientY, ox = el.x, oy = el.y;
  const div = canvas.querySelector(`.el[data-idx="${i}"]`);
  function mv(ev) { el.x = Math.round(ox + (ev.clientX - sx) / SCALE); el.y = Math.round(oy + (ev.clientY - sy) / SCALE); div.style.left = el.x + 'px'; div.style.top = el.y + 'px'; syncXY(); }
  function up() { document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); }
  document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up);
}
function startResize(e, i) {
  e.preventDefault(); e.stopPropagation();
  const el = ELS[i]; const sx = e.clientX, sy = e.clientY, ow = el.w, oh = el.h;
  const div = canvas.querySelector(`.el[data-idx="${i}"]`);
  function mv(ev) {
    el.w = Math.max(20, Math.round(ow + (ev.clientX - sx) / SCALE));
    el.h = Math.max(20, Math.round(oh + (ev.clientY - sy) / SCALE));
    div.style.width = el.w + 'px'; div.style.height = el.h + 'px';
    const span = div.querySelector('div'); if (span && el.autofit) fitSpan(span, div, el.autofit);
    syncWH();
  }
  function up() { document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); }
  document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up);
}
canvas.addEventListener('mousedown', (e) => { if (e.target === canvas) { SEL = -1; build(); panel(); } });

// --- Panel de propiedades ---
function num(label, val, on) { return `<label>${label}</label><input type="number" value="${Math.round(val || 0)}" data-k="${on}">`; }
function colorInput(label, val, key) { return `<label>${label}</label><input type="color" data-k="${key}" value="${hex(val)}">`; }
function panel() {
  const p = $('#panel');
  if (SEL < 0) {
    const bg = FRAME.background || {};
    p.innerHTML = `<h2>Fondo</h2>${colorInput('Color de fondo', bg.color || '#000000', 'backgroundColor')}<div class="empty" style="margin-top:18px">Haz clic en un elemento para editarlo.</div>`;
    p.querySelectorAll('[data-k]').forEach((inp) => inp.addEventListener('input', () => apply(inp)));
    return;
  }
  const el = ELS[SEL];
  let h = `<h2>${el.type}${el.bind ? ' · ' + el.bind : ''}</h2>`;
  if (el.type === 'text' || el.type === 'chip') {
    h += `<label>Texto</label><input data-k="text" value="${(el.text || '').replace(/"/g, '&quot;')}">`;
    if (el.bind) h += `<div style="font-size:10px;color:#6f86ad;margin-top:3px">Vinculado a "${el.bind}": se actualiza con el dato de la cartela.</div>`;
    h += `<label>Fuente</label><select data-k="font"><option value="display"${el.font === 'display' ? ' selected' : ''}>Titular (Anton)</option><option value="text"${el.font !== 'display' ? ' selected' : ''}>Texto (Oswald)</option></select>`;
    h += `<div class="row"><div>${colorInput('Color texto', el.color, 'color')}</div><div><label>Peso</label><select data-k="weight"><option ${el.weight == 400 ? 'selected' : ''}>400</option><option ${el.weight == 600 ? 'selected' : ''}>600</option><option ${el.weight == 700 ? 'selected' : ''}>700</option><option ${el.weight == 800 ? 'selected' : ''}>800</option></select></div></div>`;
    if (el.type === 'chip') h += colorInput('Color de caja', el.bg || '#000000', 'bg');
    h += `<div class="row"><div><label>Alineación</label><select data-k="align"><option value="left"${el.align === 'left' ? ' selected' : ''}>Izq</option><option value="center"${el.align === 'center' ? ' selected' : ''}>Centro</option><option value="right"${el.align === 'right' ? ' selected' : ''}>Der</option></select></div><div><label>Interletra (em)</label><input type="number" step="0.01" value="${el.letterSpacingEm || 0}" data-k="letterSpacingEm"></div></div>`;
    if (el.autofit) h += `<div class="row"><div>${num('Tamaño mín', el.autofit.min, 'afmin')}</div><div>${num('Tamaño máx', el.autofit.max, 'afmax')}</div></div>`;
    else h += num('Tamaño', el.size, 'size');
  }
  if (el.type === 'logo') {
    h += `<div class="empty">Logo de esta cartela. Puedes moverlo y cambiar su tamaño. La imagen se actualiza desde Ajustes.</div>`;
  }
  if (el.type === 'rect' || el.type === 'band') h += colorInput('Color', el.color, 'color');
  h += `<h2 style="margin-top:16px">Posición y tamaño</h2><div class="row"><div>${num('X', el.x, 'x')}</div><div>${num('Y', el.y, 'y')}</div></div>`;
  if (el.type !== 'chip') h += `<div class="row"><div>${num('Ancho', el.w, 'w')}</div><div>${num('Alto', el.h, 'h')}</div></div>`;
  h += `<button class="ghost" id="btnHide" style="margin-top:14px;width:100%">${el.hidden ? 'Mostrar' : 'Ocultar'} elemento</button>`;
  p.innerHTML = h;
  p.querySelectorAll('[data-k]').forEach((inp) => inp.addEventListener('input', () => apply(inp)));
  $('#btnHide').addEventListener('click', () => { el.hidden = !el.hidden; build(); panel(); });
}
function hex(c) { return (c && c[0] === '#') ? c.slice(0, 7) : '#ffffff'; }
function apply(inp) {
  if (inp.dataset.k === 'backgroundColor') {
    FRAME.background = FRAME.background || { type: 'solid' };
    FRAME.background.color = inp.value;
    FRAME.background.colorFixed = true;
    delete FRAME.background.colorTheme;
    build();
    return;
  }
  const el = ELS[SEL], k = inp.dataset.k, v = inp.value;
  if (k === 'afmin') el.autofit.min = +v;
  else if (k === 'afmax') el.autofit.max = +v;
  else if (['x', 'y', 'w', 'h', 'size', 'weight'].includes(k)) el[k] = +v;
  else if (k === 'letterSpacingEm') el.letterSpacingEm = +v;
  else {
    el[k] = v;
    if (k === 'color') { delete el.colorTheme; el.colorFixed = true; }
    if (k === 'bg') { delete el.bgTheme; el.bgFixed = true; }
  }
  const div = canvas.querySelector(`.el[data-idx="${SEL}"]`);
  if (div) div.replaceWith(renderEl(el, SEL));
}
function syncXY() { const p = $('#panel'); const xi = p.querySelector('[data-k="x"]'), yi = p.querySelector('[data-k="y"]'); if (xi) xi.value = ELS[SEL].x; if (yi) yi.value = ELS[SEL].y; }
function syncWH() { const p = $('#panel'); const wi = p.querySelector('[data-k="w"]'), hi = p.querySelector('[data-k="h"]'); if (wi) wi.value = ELS[SEL].w; if (hi) hi.value = ELS[SEL].h; }

// --- Guardar / restablecer ---
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
$('#btnSave').addEventListener('click', async () => {
  const r = await fetch('/api/cards/' + ID + '/layout', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ layout: layoutPayload() }) });
  toast(r.ok ? 'Diseño guardado SOLO en esta cartela ✓' : 'Error al guardar');
});
$('#btnDefault').addEventListener('click', async () => {
  if (FRAME.template === 'agenda') {
    toast('En Agenda usa Guardar diseño: el predeterminado global esta bloqueado');
    return;
  }
  const theme = FRAME.theme && FRAME.theme.key ? FRAME.theme.key : '';
  if (!confirm('¿Aplicar este diseño como PREDETERMINADO de la plantilla "' + FRAME.template + '" SOLO para el tema "' + theme + '"?')) return;
  const r = await fetch('/api/templates/' + FRAME.template + '/layout', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ theme, layout: layoutPayload() }) });
  toast(r.ok ? 'Guardado como plantilla + color ✓' : 'Error');
});
$('#btnResetDefault').addEventListener('click', async () => {
  if (FRAME.template === 'agenda') {
    toast('Agenda no tiene predeterminado global');
    return;
  }
  const theme = FRAME.theme && FRAME.theme.key ? FRAME.theme.key : '';
  if (!confirm('¿Borrar el diseño PREDETERMINADO de la plantilla "' + FRAME.template + '" SOLO para el tema "' + theme + '"? Las cartelas volverán al diseño sano de código.')) return;
  const r = await fetch('/api/templates/' + FRAME.template + '/layout?theme=' + encodeURIComponent(theme), { method: 'DELETE' });
  toast(r.ok ? 'Plantilla + color restablecida ✓' : 'Error');
  if (r.ok) setTimeout(() => location.reload(), 450);
});
$('#btnReset').addEventListener('click', async () => {
  if (!confirm('¿Volver al diseño por defecto de la plantilla? Se perderán los cambios de esta cartela.')) return;
  await fetch('/api/cards/' + ID + '/layout', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ layout: null }) });
  location.reload();
});
window.addEventListener('resize', () => { fit(); });
load();
