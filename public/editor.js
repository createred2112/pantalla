'use strict';
// Editor visual de cartela (F2b). Carga el frame resuelto, lo pinta a escala,
// permite seleccionar/arrastrar/redimensionar y editar propiedades, y guarda el
// layout (overrides) de la cartela.
//
// Mejoras de usabilidad:
//  - Seleccionar NO recalcula el auto-ajuste (el texto ya no "salta" al clicar).
//  - Se muestra siempre el TAMAÑO REAL del texto en px, en vivo.
//  - Botón "Fijar tamaño": convierte el auto-ajuste en un tamaño exacto en px.
//  - Botón "Caja al texto": encoge la caja al contenido (fuera espacios muertos).
//  - Herramientas "respecto a otro elemento": igualar tamaño/ancho/alto y alinear.
//  - Selector de elementos (para solapados) + "ver cajas" + flechas del teclado.
const ID = new URLSearchParams(location.search).get('id');
const $ = (s) => document.querySelector(s);
const canvas = $('#canvas'), wrap = $('#canvasWrap'), stage = $('#stage');
let FRAME = null, ELS = [], SCALE = 1, SEL = -1;
let FONT_DISPLAY = "'Anton',sans-serif", FONT_TEXT = "'Oswald',sans-serif";

function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 1800); }
function mediaUrl(p) { return p ? '/media/' + p.replace('data/uploads/', 'uploads/').replace('data/worker-inbox/', 'inbox/') : ''; }
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

async function loadFonts() {
  try { const css = await (await fetch('/api/fontcss')).text(); const s = document.createElement('style'); s.textContent = css; document.head.appendChild(s); } catch {}
}
function applyFrame(frame) {
  FRAME = frame;
  ELS = FRAME.elements;
  if (SEL >= ELS.length) SEL = -1;
  FONT_DISPLAY = FRAME.fontDisplay || FONT_DISPLAY;
  FONT_TEXT = FRAME.fontText || FONT_TEXT;
  $('#hint').textContent = FRAME.template + ' · ' + FRAME.W + '×' + FRAME.H + (FRAME.designVersion ? ' · diseño ' + FRAME.designVersion : '');
  $('#scope').innerHTML = `Editando <b>${FRAME.hasOwnLayout ? 'esta cartela' : 'plantilla base'}</b> · tema <b>${FRAME.theme && FRAME.theme.key ? FRAME.theme.key : 'auto'}</b>`;
  fit(); build();
  panel();
  // Cuando terminen de cargar las fuentes, un ÚNICO reajuste. Así el tamaño que
  // ves es siempre el definitivo y ya no cambia al hacer clic en un texto.
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
  if (i === SEL) addHandle(d, el);
  return d;
}
function addHandle(d, el) {
  if (!d || !el || el.type === 'chip' || d.style.pointerEvents === 'none') return;
  const h = document.createElement('div');
  h.className = 'handle';
  h.addEventListener('mousedown', (e) => startResize(e, +d.dataset.idx));
  d.appendChild(h);
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
// Reajusta todos los textos auto (tras cargar fuentes o al pedirlo).
function refitAll() {
  canvas.querySelectorAll('.el').forEach((d) => {
    const el = ELS[+d.dataset.idx];
    if (!el || el.type !== 'text' || !el.autofit) return;
    const span = d.querySelector('.txt');
    if (span) { el._px = fitSpan(span, d, el.autofit); syncSizeInfo(el); }
  });
}
function refitOne(i) {
  const d = canvas.querySelector(`.el[data-idx="${i}"]`);
  const el = ELS[i];
  if (!d || !el || el.type !== 'text' || !el.autofit) return;
  const span = d.querySelector('.txt');
  if (span) { el._px = fitSpan(span, d, el.autofit); syncSizeInfo(el); }
}

// --- Selección / arrastre / redimensión ---
// Seleccionar solo cambia el resaltado: NO se reconstruye el lienzo, así el
// auto-ajuste no se recalcula y el texto no cambia de tamaño al clicar.
function select(i) {
  SEL = i;
  canvas.querySelectorAll('.handle').forEach((n) => n.remove());
  canvas.querySelectorAll('.el').forEach((n) => n.classList.toggle('sel', +n.dataset.idx === i));
  if (i >= 0) {
    const d = canvas.querySelector(`.el[data-idx="${i}"]`);
    addHandle(d, ELS[i]);
  }
  panel();
}
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
    const span = div.querySelector('.txt'); if (span && el.autofit) { el._px = fitSpan(span, div, el.autofit); syncSizeInfo(el); }
    syncWH();
  }
  function up() { document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); }
  document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up);
}
canvas.addEventListener('mousedown', (e) => { if (e.target === canvas) select(-1); });

// Flechas del teclado: mover 1px (con Shift, 10px). Para ajustes finos sin ratón.
document.addEventListener('keydown', (e) => {
  if (SEL < 0) return;
  if (/^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement && document.activeElement.tagName)) return;
  const step = e.shiftKey ? 10 : 1;
  const el = ELS[SEL];
  let moved = false;
  if (e.key === 'ArrowLeft') { el.x -= step; moved = true; }
  if (e.key === 'ArrowRight') { el.x += step; moved = true; }
  if (e.key === 'ArrowUp') { el.y -= step; moved = true; }
  if (e.key === 'ArrowDown') { el.y += step; moved = true; }
  if (!moved) return;
  e.preventDefault();
  const div = canvas.querySelector(`.el[data-idx="${SEL}"]`);
  if (div) { div.style.left = el.x + 'px'; div.style.top = el.y + 'px'; }
  syncXY();
});

// --- Panel de propiedades ---
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
function elLabel(el, i) {
  const t = String(el.text || el.bind || '').slice(0, 22);
  const kind = { text: 'texto', chip: 'chip', rect: 'caja', band: 'banda', svg: 'icono', logo: 'logo', image: 'imagen' }[el.type] || el.type;
  return `${i + 1} · ${kind}${el.bind ? ' (' + el.bind + ')' : ''}${t ? ' “' + t + '”' : ''}`;
}
function elementPicker() {
  return `<label>Elemento (útil si se tapan entre sí)</label>
    <select id="elPicker">
      <option value="-1"${SEL < 0 ? ' selected' : ''}>— Fondo —</option>
      ${ELS.map((el, i) => `<option value="${i}"${i === SEL ? ' selected' : ''}>${esc(elLabel(el, i))}</option>`).join('')}
    </select>`;
}
function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function elementTools(el) {
  if (!el || el.type === 'chip') return '';
  return `<h2 style="margin-top:16px">Centrar en la pantalla</h2>
    <div class="toolgrid">
      <button type="button" class="ghost" data-tool="alignLeft" title="Alinear al borde izquierdo">Izq</button>
      <button type="button" class="ghost" data-tool="centerX" title="Centrar horizontalmente">Centro X</button>
      <button type="button" class="ghost" data-tool="alignRight" title="Alinear al borde derecho">Der</button>
      <button type="button" class="ghost" data-tool="alignTop" title="Alinear arriba">Arriba</button>
      <button type="button" class="ghost" data-tool="centerY" title="Centrar verticalmente">Centro Y</button>
      <button type="button" class="ghost" data-tool="alignBottom" title="Alinear abajo">Abajo</button>
    </div>`;
}
function referenceTools(el) {
  if (!el) return '';
  const others = ELS.map((o, i) => ({ o, i })).filter(({ o, i }) => i !== SEL && !o.hidden && o.type !== 'svg');
  if (!others.length) return '';
  const isText = el.type === 'text' || el.type === 'chip';
  return `<h2 style="margin-top:16px">Respecto a otro elemento</h2>
    <select id="refPicker">${others.map(({ o, i }) => `<option value="${i}">${esc(elLabel(o, i))}</option>`).join('')}</select>
    <div class="toolgrid" style="margin-top:6px">
      ${isText ? '<button type="button" class="ghost" data-ref="matchFont" title="Deja este texto exactamente al mismo tamaño en px que el elemento elegido">= Tamaño txt</button>' : ''}
      <button type="button" class="ghost" data-ref="matchW" title="Mismo ancho">= Ancho</button>
      <button type="button" class="ghost" data-ref="matchH" title="Mismo alto">= Alto</button>
      <button type="button" class="ghost" data-ref="alignL" title="Misma X (bordes izquierdos)">Izq con</button>
      <button type="button" class="ghost" data-ref="alignCX" title="Mismo centro horizontal">Centro X</button>
      <button type="button" class="ghost" data-ref="alignR" title="Bordes derechos juntos">Der con</button>
      <button type="button" class="ghost" data-ref="alignT" title="Misma Y (bordes superiores)">Arriba</button>
      <button type="button" class="ghost" data-ref="alignCY" title="Mismo centro vertical">Centro Y</button>
      <button type="button" class="ghost" data-ref="alignB" title="Bordes inferiores juntos">Abajo</button>
    </div>`;
}
function sizeBlock(el) {
  if (el.type !== 'text') return el.type === 'chip' ? num('Tamaño', el.size, 'size') : '';
  let h = '';
  if (el.autofit) {
    h += `<div class="row"><div>${num('Tamaño mín', el.autofit.min, 'afmin')}</div><div>${num('Tamaño máx', el.autofit.max, 'afmax')}</div><div>${num('Líneas máx', el.autofit.lines || 1, 'aflines')}</div></div>`;
    h += `<div class="sizeinfo" id="sizeInfo">Tamaño real ahora: <b>${el._px || '…'} px</b> (auto-ajuste: crece hasta llenar la caja o llegar al máximo)</div>`;
    h += `<div class="row" style="margin-top:8px"><div><button type="button" class="ghost wfull" data-tool="fixSize">Fijar tamaño actual (${el._px || '…'} px)</button></div><div><button type="button" class="ghost wfull" data-tool="shrinkBox">Caja al texto</button></div></div>`;
    h += `<div class="hint2">“Fijar tamaño” desactiva el auto-ajuste: el texto queda EXACTAMENTE a ese tamaño aunque muevas la caja. “Caja al texto” elimina el espacio muerto de la caja.</div>`;
  } else {
    h += num('Tamaño (px exactos)', el.size, 'size');
    h += `<div class="row" style="margin-top:8px"><div><button type="button" class="ghost wfull" data-tool="autoSize">Volver a auto-ajuste</button></div><div><button type="button" class="ghost wfull" data-tool="shrinkBox">Caja al texto</button></div></div>`;
    h += `<div class="hint2">Tamaño fijo: lo que pongas es lo que sale. Si no cabe en la caja se recorta, agranda la caja o baja el número.</div>`;
  }
  return h;
}
function panel() {
  const p = $('#panel');
  let h = elementPicker();
  if (SEL < 0) {
    const bg = FRAME.background || {};
    h += `<h2 style="margin-top:14px">Fondo</h2>${colorInput('Color de fondo', bg.color || '#000000', 'backgroundColor')}${bgRoleOptions(bg.colorTheme, bg.colorFixed)}<div class="empty" style="margin-top:18px">Haz clic en un elemento (o elígelo arriba) para editarlo.</div>`;
    p.innerHTML = h;
    wireCommon(p);
    return;
  }
  const el = ELS[SEL];
  h += `<h2 style="margin-top:14px">${el.type}${el.bind ? ' · ' + el.bind : ''}</h2>`;
  if (el.type === 'text' || el.type === 'chip') {
    h += `<label>Texto</label><input data-k="text" value="${(el.text || '').replace(/"/g, '&quot;')}">`;
    if (el.bind) h += `<div style="font-size:10px;color:#6f86ad;margin-top:3px">Vinculado a "${el.bind}": se actualiza con el dato de la cartela.</div>`;
    h += `<label>Fuente</label><select data-k="font"><option value="display"${el.font === 'display' ? ' selected' : ''}>Titular</option><option value="text"${el.font !== 'display' ? ' selected' : ''}>Texto</option></select>`;
    h += `<div class="row"><div>${colorInput('Color texto', el.color, 'color')}${roleOptions(el.colorTheme, el.colorFixed)}</div><div><label>Peso</label><select data-k="weight"><option ${el.weight == 400 ? 'selected' : ''}>400</option><option ${el.weight == 600 ? 'selected' : ''}>600</option><option ${el.weight == 700 ? 'selected' : ''}>700</option><option ${el.weight == 800 ? 'selected' : ''}>800</option></select></div></div>`;
    if (el.type === 'chip') h += colorInput('Color de caja', el.bg || '#000000', 'bg') + roleOptions(el.bgTheme, el.bgFixed).replace('data-k="colorRole"', 'data-k="bgRole"');
    h += `<div class="row"><div><label>Alineación</label><select data-k="align"><option value="left"${el.align === 'left' ? ' selected' : ''}>Izq</option><option value="center"${el.align === 'center' ? ' selected' : ''}>Centro</option><option value="right"${el.align === 'right' ? ' selected' : ''}>Der</option></select></div><div><label>Interletra (em)</label><input type="number" step="0.01" value="${el.letterSpacingEm || 0}" data-k="letterSpacingEm"></div></div>`;
    h += sizeBlock(el);
  }
  if (el.type === 'logo') {
    h += `<div class="empty">Logo de esta cartela. Puedes moverlo y cambiar su tamaño. La imagen se actualiza desde Ajustes.</div>`;
  }
  if (el.type === 'rect' || el.type === 'band') h += colorInput('Color', el.color, 'color') + roleOptions(el.colorTheme, el.colorFixed);
  h += elementTools(el);
  h += referenceTools(el);
  h += `<h2 style="margin-top:16px">Posición y tamaño</h2><div class="row"><div>${num('X', el.x, 'x')}</div><div>${num('Y', el.y, 'y')}</div></div>`;
  if (el.type !== 'chip') h += `<div class="row"><div>${num('Ancho', el.w, 'w')}</div><div>${num('Alto', el.h, 'h')}</div></div>`;
  h += `<button class="ghost" id="btnHide" style="margin-top:14px;width:100%">${el.hidden ? 'Mostrar' : 'Ocultar'} elemento</button>`;
  p.innerHTML = h;
  wireCommon(p);
  p.querySelectorAll('[data-tool]').forEach((btn) => btn.addEventListener('click', () => toolAction(btn.dataset.tool)));
  p.querySelectorAll('[data-ref]').forEach((btn) => btn.addEventListener('click', () => refAction(btn.dataset.ref)));
  const hide = $('#btnHide');
  if (hide) hide.addEventListener('click', () => { el.hidden = !el.hidden; rebuildOne(SEL); panel(); });
}
function wireCommon(p) {
  p.querySelectorAll('[data-k]').forEach((inp) => inp.addEventListener('input', () => apply(inp)));
  const picker = $('#elPicker');
  if (picker) picker.addEventListener('change', () => select(+picker.value));
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
// Reconstruye SOLO un elemento (mantiene selección y tamaño estable del resto).
function rebuildOne(i) {
  const el = ELS[i];
  const div = canvas.querySelector(`.el[data-idx="${i}"]`);
  if (!div || !el) return;
  const fresh = renderEl(el, i);
  div.replaceWith(fresh);
}
function toolAction(action) {
  if (SEL < 0) return;
  const el = ELS[SEL];
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
  const refW = ref.w || 0, refH = ref.h || 0;
  if (action === 'matchFont') {
    const px = effectivePx(ref);
    if (!px) { toast('El elemento de referencia no tiene texto'); return; }
    if (el.type === 'chip') el.size = px;
    else if (el.autofit) { el.autofit.min = px; el.autofit.max = px; }
    else el.size = px;
    toast('Texto igualado a ' + px + ' px');
  }
  if (action === 'matchW') el.w = refW;
  if (action === 'matchH') el.h = refH;
  if (action === 'alignL') el.x = ref.x;
  if (action === 'alignR') el.x = ref.x + refW - (el.w || 0);
  if (action === 'alignCX') el.x = Math.round(ref.x + (refW - (el.w || 0)) / 2);
  if (action === 'alignT') el.y = ref.y;
  if (action === 'alignB') el.y = ref.y + refH - (el.h || 0);
  if (action === 'alignCY') el.y = Math.round(ref.y + (refH - (el.h || 0)) / 2);
  rebuildOne(SEL);
  select(SEL);
}
function apply(inp) {
  if (inp.dataset.k === 'backgroundColor') {
    FRAME.background = FRAME.background || { type: 'solid' };
    bindColor(FRAME.background, 'color', 'colorTheme', 'colorFixed', inp.value);
    build();
    panel();
    return;
  }
  if (inp.dataset.k === 'backgroundRole') {
    FRAME.background = FRAME.background || { type: 'solid' };
    setRole(FRAME.background, 'color', 'colorTheme', 'colorFixed', inp.value);
    build();
    panel();
    return;
  }
  const el = ELS[SEL], k = inp.dataset.k, v = inp.value;
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
  // renderEl ya marca la selección y añade el asa cuando i === SEL.
  rebuildOne(SEL);
}
function syncXY() { const p = $('#panel'); const xi = p.querySelector('[data-k="x"]'), yi = p.querySelector('[data-k="y"]'); if (xi) xi.value = ELS[SEL].x; if (yi) yi.value = ELS[SEL].y; }
function syncWH() { const p = $('#panel'); const wi = p.querySelector('[data-k="w"]'), hi = p.querySelector('[data-k="h"]'); if (wi) wi.value = ELS[SEL].w; if (hi) hi.value = ELS[SEL].h; }
function syncSizeInfo(el) {
  if (SEL < 0 || ELS[SEL] !== el) return;
  const info = $('#sizeInfo');
  if (info) info.innerHTML = `Tamaño real ahora: <b>${el._px || '…'} px</b> (auto-ajuste: crece hasta llenar la caja o llegar al máximo)`;
  const fixBtn = document.querySelector('[data-tool="fixSize"]');
  if (fixBtn) fixBtn.textContent = `Fijar tamaño actual (${el._px || '…'} px)`;
}

// Ver todas las cajas (para entender qué pisa a qué).
const boxToggle = $('#chkBoxes');
if (boxToggle) boxToggle.addEventListener('change', () => canvas.classList.toggle('boxes', boxToggle.checked));

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
