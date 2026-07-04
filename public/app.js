'use strict';
// Estudio GasteizBerri — panel de administración. Vanilla JS, móvil-first.

const TOKEN = new URLSearchParams(location.search).get('token') || '';
const H = { 'Content-Type': 'application/json', ...(TOKEN ? { 'x-panel-token': TOKEN } : {}) };

const $ = (s) => document.querySelector(s);
const api = async (path, opts = {}) => {
  const r = await fetch('/api' + path, { headers: H, ...opts });
  if (r.status === 401) { location.href = '/login'; throw new Error('sesión expirada'); }
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || r.status);
  return r.json();
};

function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2200);
}

let cards = [];
let TEMPLATES = [];
let PALETTE = {};
let SAFETY = {};
let RUNDOWN = null;
let RUNDOWN_SELECTED = 0;
let LIBRARY_CATEGORY = 'datosUtiles';

// Galería visual de plantillas (probar varias con los datos actuales).
let galleryOpen = false;
let galleryToken = 0;
const tplCache = new Map(); // clave: template|datos -> objectURL

async function loadConfig() {
  try {
    const cfg = await api('/config');
    TEMPLATES = cfg.templates || [];
    PALETTE = cfg.palette || {};
    SAFETY = cfg.safety || {};
    $('#edTemplate').innerHTML = TEMPLATES.map((t) => `<option value="${t.id}">${t.label}</option>`).join('');
    $('#edTheme').innerHTML = '<option value="">Auto (según plantilla)</option>' +
      Object.keys(PALETTE).map((k) => `<option value="${k}">${k}</option>`).join('');
    if (SAFETY.safeMode) {
      $('#btnGallery').textContent = 'Galería desactivada en modo seguro';
      $('#btnGallery').disabled = true;
      $('#edVideo').disabled = true;
      $('#edVideo').checked = false;
    }
  } catch {}
}
function renderSwatches() {
  const cont = $('#themeSwatches');
  const sel = $('#edTheme').value || (TEMPLATES.find((t) => t.id === $('#edTemplate').value) || {}).defaultTheme;
  cont.innerHTML = Object.entries(PALETTE).map(([k, p]) => {
    const on = k === sel;
    return `<button type="button" data-theme="${k}" title="${k}" style="width:34px;height:34px;border-radius:8px;border:${on ? '3px solid #fff' : '2px solid #244170'};background:linear-gradient(135deg,${p.bg},${p.bg2});position:relative">` +
      `<span style="position:absolute;right:3px;bottom:3px;width:9px;height:9px;border-radius:50%;background:${p.accent}"></span></button>`;
  }).join('');
}
function applyHints() {
  const t = TEMPLATES.find((x) => x.id === $('#edTemplate').value);
  const h = (t && t.hint) || {};
  $('#hTitle').textContent = h.title ? '· ' + h.title : '';
  $('#hSubtitle').textContent = h.subtitle ? '· ' + h.subtitle : '';
  $('#hBody').textContent = h.body && h.body !== '—' ? '· ' + h.body : '';
  $('#hDate').textContent = h.date ? '· ' + h.date : '';
  renderSwatches();
  if (galleryOpen) highlightTpl();
}

// ===== Ajustes de diseño =====
const settingsDlg = $('#settingsDlg');
let SETTINGS = null;
let DV = Date.now(); // versión de diseño, para refrescar miniaturas

$('#btnSettings').addEventListener('click', openSettings);

async function openSettings() {
  SETTINGS = await api('/settings');
  const b = SETTINGS.brand;
  $('#setLogoMode').value = b.logoMode === 'none' ? 'none' : 'image';
  $('#setLogoW').value = b.logoWidth || 12; $('#setLogoWVal').textContent = $('#setLogoW').value;
  $('#setScale').value = b.textScale || 1.15; $('#setScaleVal').textContent = (b.textScale || 1.15);
  const ci = b.climaIcon || {};
  $('#setClimaScale').value = ci.scale || 100; $('#setClimaScaleVal').textContent = $('#setClimaScale').value;
  $('#setClimaDx').value = ci.dx || 0; $('#setClimaDxVal').textContent = $('#setClimaDx').value;
  $('#setClimaDy').value = ci.dy || 0; $('#setClimaDyVal').textContent = $('#setClimaDy').value;
  const fams = SETTINGS.fonts || [];
  const opts = fams.map((f) => `<option value="'${f}', sans-serif">${f}</option>`).join('');
  $('#setFontDisplay').innerHTML = opts; $('#setFontText').innerHTML = opts;
  // marca la familia actual (primer nombre entre comillas)
  const cur = (s) => { const m = (s || '').match(/'([^']+)'/); return m ? m[1] : ''; };
  setSelectByFamily($('#setFontDisplay'), cur(b.fontDisplay));
  setSelectByFamily($('#setFontText'), cur(b.fontFamily));
  showLogoPrev('setLogoLightPrev', b.logoLight || b.logo);
  showLogoPrev('setLogoDarkPrev', b.logoDark);
  const screen = SETTINGS.screen || {};
  const profile = SETTINGS.screenProfile || {};
  $('#setProfileName').value = profile.name || 'Pantalla principal';
  $('#setScreenW').value = screen.width || 1920;
  $('#setScreenH').value = screen.height || 1080;
  $('#setScreenFormat').value = (screen.format || 'jpg').toLowerCase();
  $('#setAcceptImage').checked = profile.acceptImage !== false;
  $('#setAcceptVideo').checked = profile.acceptVideo !== false;
  $('#setIncludePlaylist').checked = profile.includePlaylist !== false;
  $('#setProfileNotes').value = profile.notes || '';
  const naming = SETTINGS.naming || {};
  $('#setNamePattern').value = naming.pattern || '{nn}_{slug}';
  $('#setPadStart').value = naming.padStart || 2;
  $('#setSeparator').value = naming.separator || '_';
  $('#setLowercase').checked = naming.lowercase !== false;
  const ftp = SETTINGS.ftp || {};
  $('#setFtpHost').value = ftp.host || '';
  $('#setFtpPort').value = ftp.port || 21;
  $('#setFtpUser').value = ftp.user || '';
  $('#setFtpPassword').value = '';
  $('#setFtpRemoteDir').value = ftp.remoteDir || '/';
  $('#setFtpSecure').checked = ftp.secure === true;
  $('#setFtpClear').checked = ftp.clearRemoteFirst === true;
  const eff = ftp.effective || {};
  $('#setFtpHint').textContent = `${ftp.hasPassword ? 'Hay contraseña guardada. ' : ''}FTP activo: ${eff.host || 'sin servidor'}:${eff.port || 21} · carpeta ${eff.remoteDir || '/'}`;
  $('#setFtpTest').style.display = 'none';
  buildBumperEditor();
  buildColorEditor();
  $('#setPreview').style.display = 'none';
  settingsDlg.showModal();
}
function setSelectByFamily(sel, fam) {
  for (const o of sel.options) if (o.textContent === fam) { sel.value = o.value; return; }
}
function showLogoPrev(id, path) {
  const el = $('#' + id);
  if (path) { el.src = '/media/' + path.replace('data/uploads/', 'uploads/').replace('data/worker-inbox/', 'inbox/'); el.style.display = 'inline-block'; }
  else el.style.display = 'none';
}
function buildColorEditor() {
  const p = SETTINGS.palette || {};
  $('#setColors').innerHTML = Object.entries(p).map(([k, t]) => `
    <div style="display:flex;align-items:center;gap:8px;margin:6px 0">
      <b style="width:64px;font-size:12px">${k}</b>
      <label style="margin:0;font-size:11px">fondo <input type="color" data-th="${k}" data-key="bg" value="${t.bg}"></label>
      <label style="margin:0;font-size:11px">texto <input type="color" data-th="${k}" data-key="text" value="${hex(t.text)}"></label>
      <label style="margin:0;font-size:11px">acento <input type="color" data-th="${k}" data-key="accent" value="${hex(t.accent)}"></label>
    </div>`).join('');
}
function hex(c) { return (c && c[0] === '#') ? c.slice(0, 7) : '#000000'; }

function buildBumperEditor() {
  const bumpers = SETTINGS.templateBumpers || {};
  const chosen = ['clima', 'prevision', 'luz', 'gasolina', 'dato', 'alerta', 'agenda', 'noticia', 'mensaje'];
  const list = chosen.map((id) => TEMPLATES.find((t) => t.id === id)).filter(Boolean);
  $('#setTemplateBumpers').innerHTML = list.map((t) => {
    const b = bumpers[t.id] || {};
    return `<div data-bumper-template="${esc(t.id)}" style="padding:10px;margin:8px 0;background:#0a1a30;border:1px dashed var(--line);border-radius:10px">
      <b style="font-size:13px">${esc(t.label)}</b>
      <label>Entrada MP4</label>
      <input type="file" data-bumper-file="intro" accept="video/mp4,video/*">
      <input data-bumper-path="intro" value="${esc(b.intro || '')}" placeholder="data/uploads/entrada-${esc(t.id)}.mp4">
      <label>Salida MP4</label>
      <input type="file" data-bumper-file="outro" accept="video/mp4,video/*">
      <input data-bumper-path="outro" value="${esc(b.outro || '')}" placeholder="data/uploads/salida-${esc(t.id)}.mp4">
    </div>`;
  }).join('');
}

function collectTemplateBumpers() {
  const out = {};
  $('#setTemplateBumpers').querySelectorAll('[data-bumper-template]').forEach((row) => {
    const id = row.dataset.bumperTemplate;
    const intro = row.querySelector('[data-bumper-path="intro"]').value.trim();
    const outro = row.querySelector('[data-bumper-path="outro"]').value.trim();
    if (intro || outro) out[id] = { intro, outro };
  });
  return out;
}

$('#setLogoW').addEventListener('input', (e) => $('#setLogoWVal').textContent = e.target.value);
$('#setScale').addEventListener('input', (e) => $('#setScaleVal').textContent = e.target.value);
$('#setClimaScale').addEventListener('input', (e) => $('#setClimaScaleVal').textContent = e.target.value);
$('#setClimaDx').addEventListener('input', (e) => $('#setClimaDxVal').textContent = e.target.value);
$('#setClimaDy').addEventListener('input', (e) => $('#setClimaDyVal').textContent = e.target.value);

$('#setLogoLight').addEventListener('change', async (e) => {
  if (e.target.files[0]) { toast('Subiendo logo…'); const p = await uploadFile(e.target); SETTINGS.brand.logoLight = p; showLogoPrev('setLogoLightPrev', p); toast('Logo claro listo'); }
});
$('#setLogoDark').addEventListener('change', async (e) => {
  if (e.target.files[0]) { toast('Subiendo logo…'); const p = await uploadFile(e.target); SETTINGS.brand.logoDark = p; showLogoPrev('setLogoDarkPrev', p); toast('Logo oscuro listo'); }
});
$('#setTemplateBumpers').addEventListener('change', async (e) => {
  const fileInput = e.target.closest('[data-bumper-file]');
  if (!fileInput || !fileInput.files[0]) return;
  const row = fileInput.closest('[data-bumper-template]');
  const kind = fileInput.dataset.bumperFile;
  toast('Subiendo cortinilla…');
  const p = await uploadFile(fileInput);
  row.querySelector(`[data-bumper-path="${kind}"]`).value = p || '';
  toast('Cortinilla lista');
});

function collectSettings() {
  const b = SETTINGS.brand;
  b.logoMode = $('#setLogoMode').value;
  b.logoWidth = Number($('#setLogoW').value);
  b.textScale = Number($('#setScale').value);
  b.fontDisplay = $('#setFontDisplay').value;
  b.fontFamily = $('#setFontText').value;
  b.climaIcon = { scale: Number($('#setClimaScale').value) || 100, dx: Number($('#setClimaDx').value) || 0, dy: Number($('#setClimaDy').value) || 0 };
  const palette = SETTINGS.palette;
  $('#setColors').querySelectorAll('input[type=color]').forEach((inp) => {
    palette[inp.dataset.th][inp.dataset.key] = inp.value;
  });
  const ftp = {
    host: $('#setFtpHost').value.trim(),
    port: Number($('#setFtpPort').value) || 21,
    user: $('#setFtpUser').value.trim(),
    password: $('#setFtpPassword').value,
    remoteDir: $('#setFtpRemoteDir').value.trim() || '/',
    secure: $('#setFtpSecure').checked,
    clearRemoteFirst: $('#setFtpClear').checked,
  };
  const fixedFiles = SETTINGS.naming && Array.isArray(SETTINGS.naming.fixedFiles) ? SETTINGS.naming.fixedFiles : [];
  const screenFormat = $('#setScreenFormat').value || 'jpg';
  return {
    brand: b,
    palette,
    screen: {
      ...(SETTINGS.screen || {}),
      width: Number($('#setScreenW').value) || 1920,
      height: Number($('#setScreenH').value) || 1080,
      format: screenFormat,
    },
    screenProfile: {
      name: $('#setProfileName').value.trim() || 'Pantalla principal',
      acceptImage: $('#setAcceptImage').checked,
      acceptVideo: $('#setAcceptVideo').checked,
      includePlaylist: $('#setIncludePlaylist').checked,
      forceVideo: fixedFiles.length > 0 || screenFormat === 'mp4',
      outputFormat: fixedFiles.length > 0 ? 'mp4' : screenFormat,
      requiredCount: fixedFiles.length || (SETTINGS.screenProfile && SETTINGS.screenProfile.requiredCount) || 0,
      notes: $('#setProfileNotes').value.trim(),
    },
    naming: {
      pattern: $('#setNamePattern').value.trim() || (fixedFiles.length ? 'berri-{n}' : '{nn}_{slug}'),
      fixedFiles,
      padStart: Number($('#setPadStart').value) || 2,
      separator: $('#setSeparator').value || '_',
      lowercase: $('#setLowercase').checked,
      prefixWithOrder: true,
    },
    templateBumpers: collectTemplateBumpers(),
    ftp,
  };
}

function showFtpTest(msg, ok) {
  const box = $('#setFtpTest');
  box.style.display = 'block';
  box.style.color = ok ? '#bff0d5' : '#ffb8c0';
  box.innerHTML = msg;
}

$('#btnSetPreview').addEventListener('click', async () => {
  await api('/settings', { method: 'PUT', body: JSON.stringify(collectSettings()) });
  DV = Date.now();
  const r = await fetch('/api/preview', { method: 'POST', headers: H, body: JSON.stringify({ template: 'mensaje', title: 'Vitoria en verde.', theme: 'lima' }) });
  const img = $('#setPreview'); img.src = URL.createObjectURL(await r.blob()); img.style.display = 'block';
  toast('Aplicado');
});
$('#btnFtpTest').addEventListener('click', async () => {
  const btn = $('#btnFtpTest');
  btn.disabled = true;
  showFtpTest('Guardando ajustes y probando FTP...', true);
  try {
    await api('/settings', { method: 'PUT', body: JSON.stringify(collectSettings()) });
    const r = await fetch('/api/ftp-test', { method: 'POST', headers: H });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'No se pudo conectar');
    showFtpTest(
      `<b>FTP OK</b><br>${esc(j.host)}:${j.port} · carpeta ${esc(j.remoteDir)}<br>${(j.steps || []).map(esc).join('<br>')}`,
      true
    );
    toast('FTP OK');
  } catch (e) {
    showFtpTest(`<b>FTP falló</b><br>${esc(e.message)}`, false);
    toast('FTP falló');
  } finally {
    btn.disabled = false;
  }
});
$('#btnFontUpload').addEventListener('click', async () => {
  const f = $('#setFontFile').files[0];
  const name = $('#setFontName').value.trim().replace(/[^A-Za-z0-9]/g, '');
  const w = $('#setFontWeight').value;
  if (!f || !name) { toast('Pon un nombre y elige el archivo'); return; }
  toast('Subiendo fuente…');
  const fd = new FormData(); fd.append('font', f);
  const r = await fetch(`/api/font?family=${encodeURIComponent(name)}&weight=${w}`, { method: 'POST', headers: TOKEN ? { 'x-panel-token': TOKEN } : {}, body: fd });
  if (!r.ok) { toast('Error al subir la fuente'); return; }
  toast('Fuente subida ✓');
  const cur = await api('/settings'); SETTINGS.fonts = cur.fonts;
  const sel1 = $('#setFontDisplay').value, sel2 = $('#setFontText').value;
  const opts = (SETTINGS.fonts || []).map((x) => `<option value="'${x}', sans-serif">${x}</option>`).join('');
  $('#setFontDisplay').innerHTML = opts; $('#setFontText').innerHTML = opts;
  $('#setFontDisplay').value = sel1; $('#setFontText').value = sel2;
  $('#setFontFile').value = '';
});
$('#btnSetSave').addEventListener('click', async () => {
  try {
    await api('/settings', { method: 'PUT', body: JSON.stringify(collectSettings()) });
    DV = Date.now(); toast('Ajustes guardados'); settingsDlg.close(); load();
  } catch (e) { toast('Error: ' + e.message); }
});

$('#btnLogout').addEventListener('click', async () => {
  await fetch('/api/logout', { method: 'POST', headers: H });
  location.href = '/login';
});

async function load() {
  api('/whoami').then((w) => {
    $('#who').textContent = w.user || '';
    $('#versionBadge').textContent = w.version ? 'v' + w.version : 'v?';
  }).catch(() => {});
  cards = await api('/cards');
  cards.sort((a, b) => (a.order || 0) - (b.order || 0));
  render();
  loadStatus();
}

function render() {
  const el = $('#list');
  const sum = $('#listSummary');
  if (!cards.length) {
    el.innerHTML = '<div class="empty">No hay cartelas todavía.<br>Crea la primera con ＋ o genera el día con la Escaleta.</div>';
    if (sum) sum.textContent = '';
    return;
  }
  if (sum) {
    const act = cards.filter((c) => c.enabled !== false);
    const secs = act.reduce((n, c) => n + (Number(c.duration) || 10), 0);
    const pending = cards.filter((c) => c.type === 'generated' && !c.rendered).length;
    sum.textContent = `${act.length} activa(s) · vuelta de ${secs}s${pending ? ` · ${pending} por generar` : ''}`;
  }
  el.innerHTML = '';
  cards.forEach((c, i) => {
    const rendered = c.rendered || null;
    const staleRendered = c.staleRendered || null;
    // Miniatura: el render fresco; si la cartela cambió, se enseña el ANTIGUO
    // con aviso (nunca se renderiza nada solo por pintar la lista).
    const shown = rendered || staleRendered;
    const thumb = c.type === 'generated'
      ? (shown && shown.url)
      : (c.file ? '/media/' + c.file.replace('data/worker-inbox/', 'inbox/').replace('data/uploads/', 'uploads/') : '');
    const isVideo = shown && shown.type === 'video';
    const staleOverlay = (c.type === 'generated' && !rendered && staleRendered)
      ? '<div class="thumb-overlay">Cambios sin aplicar · pulsa ⟳</div>' : '';
    const thumbHtml = thumb
      ? `<div class="thumb-wrap">${isVideo
          ? `<video class="thumb" src="${thumb}" ${shown.posterUrl ? `poster="${shown.posterUrl}"` : ''} muted playsinline controls preload="${shown.posterUrl ? 'none' : 'metadata'}"></video>`
          : `<img class="thumb" src="${thumb}" alt="" loading="lazy" onerror="this.style.opacity=.25">`}${staleOverlay}</div>`
      : `<div class="thumb thumb-empty">Sin generar todavía<br><span>pulsa ⟳ para crear el archivo</span></div>`;
    const div = document.createElement('div');
    div.className = 'card' + (c.enabled === false ? ' is-off' : '');
    div.innerHTML = `
      ${thumbHtml}
      <div class="meta">
        <p class="t">${esc(c.title) || '(sin título)'}</p>
        <p class="s">${esc(c.subtitle) || ''}</p>
      </div>
      <div class="row">
        ${c.type === 'generated' && rendered ? `<span class="tag ok">✓ ${rendered.ext.toUpperCase()} listo</span>` : ''}
        ${c.type === 'generated' && !rendered && staleRendered ? '<span class="tag warn">cambios sin aplicar</span>' : ''}
        ${c.type === 'generated' && !rendered && !staleRendered ? '<span class="tag warn">sin generar</span>' : ''}
        ${c.type !== 'generated' ? `<span class="tag">${c.type === 'video' ? 'vídeo' : 'imagen'}</span>` : ''}
        ${c.type === 'generated' && c.video ? '<span class="tag worker">animada</span>' : ''}
        ${c.source === 'worker' ? '<span class="tag worker">worker</span>' : ''}
        ${c.source === 'rundown' ? '<span class="tag rundown">escaleta</span>' : ''}
        ${c.enabled === false ? '<span class="tag off">oculta</span>' : ''}
        <span class="tag">${c.duration||10}s</span>
        <span class="spacer"></span>
        <button class="iconbtn" data-up="${i}" ${i===0?'disabled':''} title="Subir">▲</button>
        <button class="iconbtn" data-down="${i}" ${i===cards.length-1?'disabled':''} title="Bajar">▼</button>
        <button class="iconbtn" data-edit="${c.id}" title="Editar contenido">✎</button>
        ${c.type === 'generated' ? `<button class="iconbtn ${!rendered ? 'attn' : ''}" data-render="${c.id}" title="${rendered ? 'Regenerar archivo (no suele hacer falta)' : 'Generar el archivo'}">⟳</button>` : ''}
        ${rendered && rendered.type === 'video' ? `<button class="iconbtn" data-view-video="${c.id}" title="Ver vídeo generado">▶</button>` : ''}
        ${c.type === 'generated' && c.template !== 'gasolina' ? `<button class="iconbtn" data-design="${c.id}" title="Editor de diseño">🎨</button>` : ''}
        <button class="iconbtn danger" data-del="${c.id}" title="Eliminar">🗑</button>
      </div>`;
    el.appendChild(div);
  });
}

function esc(s){return (s||'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}

// --- Reordenar ---
async function move(i, dir) {
  const j = i + dir;
  if (j < 0 || j >= cards.length) return;
  [cards[i], cards[j]] = [cards[j], cards[i]];
  await api('/reorder', { method: 'POST', body: JSON.stringify({ ids: cards.map(c => c.id) }) });
  load();
}

// --- Editor ---
const editor = $('#editor');
let ED_SLOT = null; // bloque del guion que produce la cartela abierta (si aplica)

// Cartela producida por el guion: el lápiz enseña el mando REAL (cadencia,
// piezas del carrusel) en vez de campos que el siguiente pase sobreescribiría.
async function loadEditorRundown(card) {
  const box = $('#edRundownBox');
  try {
    RUNDOWN = await api('/rundown');
    const slot = ((RUNDOWN.rundown || {}).slots || []).find((s) => s.id === card.rundownSlot);
    if (!slot) {
      box.style.display = '';
      box.innerHTML = '<div class="status">Esta cartela venía de un bloque del guion que ya no existe. Puede editarla como cartela suelta.</div>';
      return;
    }
    ED_SLOT = slot;
    box.style.display = '';
    if (slot.source === 'library') {
      // Plantilla y tema quedan editables (se guardan en el bloque, persisten);
      // solo se ocultan los textos por-pieza, que el siguiente pase repone.
      $('#edContentFields').style.display = 'none';
      if (![...$('#edTemplate').options].some((o) => o.value === '')) {
        $('#edTemplate').insertAdjacentHTML('afterbegin', '<option value="">Auto (cada pieza con la suya)</option>');
      }
      $('#edTemplate').value = slot.template || '';
      $('#edTheme').value = slot.theme || '';
      renderSwatches();
      const keys = RUNDOWN.libraryKeys || [];
      const catLabel = (keys.find((k) => k.key === slot.libraryKey) || {}).label || slot.libraryKey;
      const items = (RUNDOWN.library && RUNDOWN.library[slot.libraryKey]) || [];
      const isAgendaLib = slot.libraryKey === 'agendaEventos';
      box.innerHTML = `
        <div class="status">Producida por el bloque <b>«${esc(slot.label)}»</b> · carrusel: <b>${esc(catLabel)}</b>.
          La plantilla y el tema elegidos abajo se aplican a TODO el bloque (vacío = cada pieza con el suyo).</div>
        <label>Cambia de pieza<select id="edSlotRotation">
          <option value="dia" ${slot.rotation !== 'hora' ? 'selected' : ''}>Cada día</option>
          <option value="hora" ${slot.rotation === 'hora' ? 'selected' : ''}>Cada hora</option>
        </select></label>
        <label>Piezas del carrusel (marcadas = en emisión)</label>
        <div style="max-height:220px;overflow:auto;border:1px solid var(--line);border-radius:10px;padding:6px 10px">
          ${items.map((p, i) => `<label class="chk"><input type="checkbox" data-ed-lib="${i}" ${p.enabled !== false ? 'checked' : ''}>${esc(p.title || p.body || '(sin título)')} <span class="hint">${esc(scheduleSummary(p))}</span></label>`).join('') || '<div class="hint">Sin piezas. Añádalas en Escaleta → Carrusel.</div>'}
        </div>
        <button type="button" class="ghost" id="edOpenRundown" style="margin-top:8px;width:100%">${isAgendaLib ? 'Editar Agenda viva' : 'Abrir carrusel en modo avanzado'}</button>`;
    } else {
      box.innerHTML = `
        <div class="status">Producida por el bloque <b>«${esc(slot.label)}»</b> del guion${slot.source === 'worker' ? ' (dato automático)' : ''}.
          La plantilla, el tema, la duración y la animación se guardan en el bloque para que no los pise el próximo pase.</div>
        <button type="button" class="ghost" id="edOpenRundown" style="margin-top:8px;width:100%">Abrir el guion (modo avanzado)</button>`;
    }
    $('#edOpenRundown').addEventListener('click', async () => {
      editor.close();
      await openRundown();
      const idx = ((RUNDOWN.rundown || {}).slots || []).findIndex((s) => s.id === card.rundownSlot);
      if (slot.source === 'library' && slot.libraryKey) {
        LIBRARY_CATEGORY = slot.libraryKey;
        LIB_OPEN = 0;
        setRundownTab('lib');
        renderLibraryPanel();
        const lib = $('#rdTabLib');
        if (lib) lib.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
      if (idx >= 0) {
        RUNDOWN_SELECTED = idx;
        renderRundown();
        const ed = $('#slotEditor');
        if (ed && !ed.hidden) ed.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    });
  } catch { box.style.display = 'none'; }
}

function openEditor(card) {
  ED_SLOT = null;
  $('#edRundownBox').style.display = 'none';
  $('#edRundownBox').innerHTML = '';
  $('#genFields').style.display = '';
  $('#edContentFields').style.display = '';
  const autoOpt = [...$('#edTemplate').options].find((o) => o.value === '');
  if (autoOpt && !(card && card.source === 'rundown')) autoOpt.remove();
  $('#urlImport').style.display = card && card.source === 'rundown' ? 'none' : '';
  if (card && card.source === 'rundown' && card.rundownSlot) loadEditorRundown(card);
  $('#edTitle').textContent = card ? 'Editar cartela' : 'Nueva cartela';
  $('#edId').value = card?.id || '';
  $('#edType').value = card?.type || 'generated';
  $('#edTemplate').value = card?.template || (TEMPLATES[0] && TEMPLATES[0].id) || 'noticia';
  $('#edTheme').value = card?.theme || '';
  $('#edTitleField').value = card?.title || '';
  $('#edSubtitle').value = card?.subtitle || '';
  $('#edBody').value = card?.body || '';
  $('#edDate').value = card?.date || '';
  $('#edPhoto').value = card?.photo || '';
  $('#edFile').value = card?.file || '';
  $('#edDuration').value = card?.duration || 10;
  $('#edEnabled').checked = card?.enabled !== false;
  $('#edVideo').checked = card?.video === true;
  if (SAFETY.safeMode) $('#edVideo').checked = false;
  const adv = $('#advVideo'); if (adv) adv.open = $('#edVideo').checked;
  $('#edVideoIntro').value = card?.videoIntro || '';
  $('#edVideoOutro').value = card?.videoOutro || '';
  $('#edPreview').style.display = 'none';
  $('#edVideoPreview').style.display = 'none';
  $('#edVideoPreview').removeAttribute('src');
  $('#edUrl').value = '';
  $('#urlHint').textContent = 'Pega el enlace y rellenamos los campos. Luego edítalos a tu gusto.';
  // Cierra la galería de plantillas al (re)abrir el editor.
  galleryOpen = false; galleryToken++;
  $('#tplGallery').innerHTML = '';
  $('#btnGallery').textContent = '🖼 Probar plantillas visualmente';
  if (SAFETY.safeMode) $('#btnGallery').textContent = 'Galería desactivada en modo seguro';
  applyHints();
  toggleType();
  editor.showModal();
}
function toggleType() {
  const t = $('#edType').value;
  $('#genFields').style.display = t === 'generated' ? '' : 'none';
  $('#fileFields').style.display = t === 'generated' ? 'none' : '';
  $('#videoBumpers').style.display = t === 'generated' && $('#edVideo').checked ? '' : 'none';
  if (t !== 'generated' && galleryOpen) {
    galleryOpen = false; galleryToken++;
    $('#tplGallery').innerHTML = '';
    $('#btnGallery').textContent = '🖼 Probar plantillas visualmente';
  }
}
$('#edType').addEventListener('change', toggleType);
$('#edVideo').addEventListener('change', toggleType);
$('#edTemplate').addEventListener('change', applyHints);
$('#edTheme').addEventListener('change', renderSwatches);
$('#themeSwatches').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  $('#edTheme').value = b.dataset.theme; renderSwatches();
  if (galleryOpen) renderTemplateGallery(); // refleja el tema elegido en las miniaturas
});

// ===== Galería visual de plantillas =====
function tplDataKey(d) {
  return [d.title, d.subtitle, d.body, d.date, d.photo, d.theme].join('|');
}
function highlightTpl() {
  const cur = $('#edTemplate').value;
  $('#tplGallery').querySelectorAll('.tplcell').forEach((c) => {
    c.classList.toggle('sel', c.dataset.tpl === cur);
  });
}
async function renderTemplateGallery(force) {
  if (SAFETY.safeMode) {
    toast('Galería desactivada en modo seguro');
    return;
  }
  const wrap = $('#tplGallery');
  const data = collect();
  if (data.type !== 'generated') { wrap.innerHTML = ''; galleryOpen = false; return; }
  galleryOpen = true;
  $('#btnGallery').textContent = '🖼 Ocultar plantillas';
  const key = tplDataKey(data);
  wrap.innerHTML = TEMPLATES.map((t) =>
    `<button type="button" class="tplcell" data-tpl="${t.id}" title="${t.label}">
       <div class="tplimg" id="tpl_${t.id}"><span class="spin">◠</span></div>
       <span class="tpllbl">${t.label}</span>
     </button>`).join('');
  highlightTpl();
  // Render secuencial (un solo navegador headless en el servidor): no saturamos.
  galleryToken++; const my = galleryToken;
  for (const t of TEMPLATES) {
    if (my !== galleryToken) return; // se cerró el diálogo o se relanzó
    const ck = t.id + '|' + key;
    if (force) tplCache.delete(ck);
    let url = tplCache.get(ck);
    if (!url) {
      try {
        const r = await fetch('/api/preview', { method: 'POST', headers: H, body: JSON.stringify({ ...data, template: t.id, _thumbW: 360 }) });
        if (!r.ok) throw new Error('render');
        url = URL.createObjectURL(await r.blob());
        tplCache.set(ck, url);
      } catch { url = null; }
    }
    if (my !== galleryToken) return;
    const cell = $('#tpl_' + t.id);
    if (cell) cell.innerHTML = url ? `<img src="${url}" alt="">` : '⚠';
  }
}
$('#btnGallery').addEventListener('click', () => {
  if (galleryOpen) { galleryOpen = false; $('#tplGallery').innerHTML = ''; $('#btnGallery').textContent = '🖼 Probar plantillas visualmente'; galleryToken++; }
  else renderTemplateGallery();
});
$('#tplGallery').addEventListener('click', (e) => {
  const b = e.target.closest('.tplcell'); if (!b) return;
  $('#edTemplate').value = b.dataset.tpl;
  applyHints();
  highlightTpl();
  toast('Plantilla: ' + (TEMPLATES.find((t) => t.id === b.dataset.tpl) || {}).label);
});

function collect() {
  return {
    type: $('#edType').value,
    template: $('#edTemplate').value,
    theme: $('#edTheme').value || null,
    title: $('#edTitleField').value,
    subtitle: $('#edSubtitle').value,
    body: $('#edBody').value,
    date: $('#edDate').value,
    photo: $('#edPhoto').value || null,
    file: $('#edFile').value || null,
    duration: Number($('#edDuration').value) || 10,
    enabled: $('#edEnabled').checked,
    video: $('#edVideo').checked,
    videoIntro: $('#edVideoIntro').value || null,
    videoOutro: $('#edVideoOutro').value || null,
  };
}

// Sube una foto y devuelve su ruta relativa.
async function uploadFile(inputEl) {
  const f = inputEl.files[0];
  if (!f) return null;
  const fd = new FormData();
  fd.append('photo', f);
  const r = await fetch('/api/upload', { method: 'POST', headers: TOKEN ? { 'x-panel-token': TOKEN } : {}, body: fd });
  const j = await r.json();
  return j.path;
}

$('#edPhotoFile').addEventListener('change', async (e) => {
  if (e.target.files[0]) { toast('Subiendo foto…'); $('#edPhoto').value = await uploadFile(e.target); toast('Foto lista'); }
});
$('#edAnyFile').addEventListener('change', async (e) => {
  if (e.target.files[0]) { toast('Subiendo…'); $('#edFile').value = await uploadFile(e.target); toast('Archivo listo'); }
});
$('#edVideoIntroFile').addEventListener('change', async (e) => {
  if (e.target.files[0]) { toast('Subiendo cortinilla…'); $('#edVideoIntro').value = await uploadFile(e.target); toast('Entrada lista'); }
});
$('#edVideoOutroFile').addEventListener('change', async (e) => {
  if (e.target.files[0]) { toast('Subiendo cortinilla…'); $('#edVideoOutro').value = await uploadFile(e.target); toast('Salida lista'); }
});

$('#btnExtract').addEventListener('click', async () => {
  const url = $('#edUrl').value.trim();
  if (!url) { toast('Pega una URL'); return; }
  const hint = $('#urlHint'); hint.textContent = 'Extrayendo…';
  try {
    const d = await api('/extract', { method: 'POST', body: JSON.stringify({ url }) });
    $('#edType').value = 'generated'; toggleType();
    if (d.title) $('#edTitleField').value = d.title;
    if (d.body) $('#edBody').value = d.body;
    if (d.subtitle) $('#edSubtitle').value = d.subtitle;
    if (d.date) $('#edDate').value = d.date;
    if (d.image) $('#edPhoto').value = d.image;
    // Sugerir plantilla: con foto, titular; si no, noticia.
    $('#edTemplate').value = d.image ? 'titular' : 'noticia';
    applyHints();
    hint.textContent = `✓ Datos de ${d.source === 'wordpress' ? 'WordPress' : 'la web'}${d.image ? ' (con foto)' : ''}. Elige plantilla abajo y ajusta.`;
    toast('Datos extraídos');
    // Abre la galería para probar plantillas con los datos ya rellenados.
    renderTemplateGallery(true);
  } catch (e) { hint.textContent = '✗ ' + e.message; toast('No se pudo extraer'); }
});

$('#btnPreview').addEventListener('click', async () => {
  const data = collect();
  if (data.type !== 'generated') { toast('Solo cartelas generadas'); return; }
  const img = $('#edPreview');
  const video = $('#edVideoPreview');
  img.style.display = 'none';
  video.style.display = 'none';
  if (data.video) {
    if (!SAFETY.videoAllowed) {
      toast('MP4 desactivado en modo seguro');
      return;
    }
    toast('Generando MP4 de prueba...');
    const r = await api('/preview-video', { method: 'POST', body: JSON.stringify(data) });
    video.src = r.url;
    video.style.display = 'block';
    video.load();
    video.play().catch(() => {});
    toast('Vista animada lista');
  } else {
    const r = await fetch('/api/preview', { method: 'POST', headers: H, body: JSON.stringify(data) });
    const blob = await r.blob();
    img.src = URL.createObjectURL(blob); img.style.display = 'block';
  }
});

$('#btnSave').addEventListener('click', async () => {
  const id = $('#edId').value;
  const renderSavedCard = async () => {
    if (!id) return;
    try { await api('/cards/' + id + '/render', { method: 'POST' }); }
    catch (e) { toast('Guardado; no se pudo regenerar ahora: ' + e.message); }
  };
  // Cartela de carrusel: se guarda el BLOQUE (cadencia, piezas, duración) y se
  // regeneran las cartelas; editar la copia materializada sería pan para hoy.
  if (ED_SLOT && ED_SLOT.source === 'library') {
    const b = $('#btnSave');
    b.disabled = true;
    try {
      const rot = $('#edSlotRotation');
      if (rot) ED_SLOT.rotation = rot.value === 'hora' ? 'hora' : 'dia';
      ED_SLOT.duration = Number($('#edDuration').value) || 8;
      ED_SLOT.enabled = $('#edEnabled').checked;
      ED_SLOT.video = $('#edVideo').checked;
      // Plantilla y tema del BLOQUE: mandan sobre los de cada pieza (vacío = auto).
      ED_SLOT.template = $('#edTemplate').value || '';
      ED_SLOT.theme = $('#edTheme').value || '';
      document.querySelectorAll('#edRundownBox [data-ed-lib]').forEach((el) => {
        const arr = RUNDOWN.library && RUNDOWN.library[ED_SLOT.libraryKey];
        const it = arr && arr[Number(el.dataset.edLib)];
        if (it) it.enabled = el.checked;
      });
      await api('/rundown', { method: 'PUT', body: JSON.stringify(RUNDOWN.rundown) });
      await api('/rundown/library', { method: 'PUT', body: JSON.stringify(RUNDOWN.library) });
      await api('/rundown/materialize', { method: 'POST', body: '{}' });
      await renderSavedCard();
      editor.close();
      toast('Bloque actualizado; cartelas regeneradas');
      load();
    } catch (e) { toast('Error: ' + e.message); }
    finally { b.disabled = false; }
    return;
  }
  const data = collect();
  if (ED_SLOT && ED_SLOT.source !== 'library') {
    const b = $('#btnSave');
    b.disabled = true;
    try {
      ED_SLOT.template = data.template || ED_SLOT.template || 'noticia';
      ED_SLOT.theme = data.theme || '';
      ED_SLOT.duration = data.duration || ED_SLOT.duration || 8;
      ED_SLOT.enabled = data.enabled !== false;
      ED_SLOT.video = data.video === true;
      ED_SLOT.videoIntro = data.videoIntro || '';
      ED_SLOT.videoOutro = data.videoOutro || '';
      if (ED_SLOT.source !== 'worker') {
        ED_SLOT.title = data.title || '';
        ED_SLOT.subtitle = data.subtitle || '';
        ED_SLOT.body = data.body || '';
        ED_SLOT.date = data.date || '';
      }
      await api('/rundown', { method: 'PUT', body: JSON.stringify(RUNDOWN.rundown) });
      await api('/rundown/materialize', { method: 'POST', body: '{}' });
      await renderSavedCard();
      editor.close();
      toast('Tema guardado en el bloque; cartela regenerada');
      load();
    } catch (e) { toast('Error: ' + e.message); }
    finally { b.disabled = false; }
    return;
  }
  try {
    const saved = id
      ? await api('/cards/' + id, { method: 'PUT', body: JSON.stringify(data) })
      : await api('/cards', { method: 'POST', body: JSON.stringify(data) });
    if ((saved && saved.type) === 'generated') {
      await api('/cards/' + saved.id + '/render', { method: 'POST' });
    }
    editor.close(); toast('Guardado y regenerado'); load();
  } catch (e) { toast('Error: ' + e.message); }
});

// --- Delegación de eventos de la lista ---
$('#list').addEventListener('click', async (e) => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.up != null) move(+b.dataset.up, -1);
  else if (b.dataset.down != null) move(+b.dataset.down, +1);
  else if (b.dataset.edit) openEditor(cards.find(c => c.id === b.dataset.edit));
  else if (b.dataset.render) {
    b.disabled = true;
    toast('Generando archivo...');
    try {
      await api('/cards/' + b.dataset.render + '/render', { method: 'POST' });
      toast('Archivo generado');
      load();
    } catch (err) {
      toast('Error: ' + err.message);
      b.disabled = false;
    }
  }
  else if (b.dataset.viewVideo) {
    const card = cards.find(c => c.id === b.dataset.viewVideo);
    const url = card && card.rendered && card.rendered.url;
    if (!url) return toast('Vídeo no generado');
    window.open(url, '_blank');
  }
  else if (b.dataset.design) location.href = '/editor.html?id=' + b.dataset.design;
  else if (b.dataset.del) {
    if (confirm('¿Eliminar esta cartela?'))
      api('/cards/' + b.dataset.del, { method: 'DELETE' }).then(() => { toast('Eliminada'); load(); });
  }
});

// --- Piloto automático ---
let PILOT = null;

function fmtLastRun(last) {
  if (!last) return 'todavía no se ha ejecutado';
  const when = last.ts ? new Date(last.ts).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : last.day;
  if (last.ok === false) return `última: ${when} · falló (mira Estado)`;
  return `última: ${when} · ${last.cards || 0} cartelas${last.published ? ' publicadas' : ' preparadas'}`;
}

function pilotTag(text, ok) {
  return `<span class="tag ${ok ? 'ok' : 'warn'}">${esc(text)}</span>`;
}

function syncLabel(minutes) {
  const n = Number(minutes || 0);
  return n > 0 ? `vigila cada ${n} min` : 'solo pase diario';
}

function renderPilot() {
  if (!PILOT) return;
  const bar = $('#pilotBar');
  bar.style.display = 'block';
  bar.classList.toggle('on', PILOT.enabled);
  $('#pilotTitle').textContent = PILOT.enabled ? 'Piloto de emisión · activo' : 'Piloto de emisión · apagado';
  const workersTxt = (PILOT.workers || []).filter((w) => w.fresh).map((w) => w.preview).filter(Boolean).join(' · ');
  const modeTxt = PILOT.mode === 'publish' ? 'publica al FTP' : 'prepara para revisar';
  const syncTxt = syncLabel(PILOT.liveSync ? PILOT.syncEveryMinutes : 0);
  $('#pilotInfo').textContent = `${modeTxt} · primer pase ${PILOT.time || '08:00'} · ${syncTxt} · ${fmtLastRun(PILOT.last)}${workersTxt ? ' · ' + workersTxt : ''}`;
  $('#pilotTime').value = PILOT.time || '08:00';
  $('#pilotMode').value = PILOT.mode === 'publish' ? 'publish' : 'review';
  const syncMinutes = PILOT.liveSync === false ? 0 : Number(PILOT.syncEveryMinutes || 10);
  $('#pilotSync').value = String([0, 5, 10, 15, 30, 60].includes(syncMinutes) ? syncMinutes : 10);
  $('#pilotToggle').textContent = PILOT.enabled ? 'Apagar' : 'Activar';
  $('#pilotToggle').classList.toggle('primary', !PILOT.enabled);
  const p = PILOT.preflight || {};
  const required = Number(p.requiredCount || 8);
  const selected = Number(p.selectedCount || 0);
  const rendered = Number(p.renderedCount || 0);
  const sync = PILOT.sync;
  const checks = [
    pilotTag(`${selected}/${required} vídeos`, selected >= required),
    pilotTag(PILOT.mode === 'publish' ? (p.ftpConfigured ? 'FTP listo' : 'FTP sin configurar') : 'revisión manual', PILOT.mode !== 'publish' || p.ftpConfigured),
    pilotTag(rendered >= Math.min(required, selected) ? 'MP4 cacheados' : `${rendered}/${Math.min(required, selected)} MP4 cacheados`, rendered >= Math.min(required, selected)),
  ];
  if (sync && sync.ts) checks.push(pilotTag(`última vigilancia ${new Date(sync.ts).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`, sync.ok !== false));
  $('#pilotChecks').innerHTML = checks.join('');
}

async function loadPilot() {
  try { PILOT = await api('/autopilot'); renderPilot(); } catch {}
}

async function savePilot(patch) {
  const syncEveryMinutes = Number($('#pilotSync').value || 0);
  PILOT = await api('/autopilot', {
    method: 'PUT',
    body: JSON.stringify({
      enabled: PILOT.enabled,
      time: $('#pilotTime').value || '08:00',
      mode: $('#pilotMode').value || 'review',
      liveSync: syncEveryMinutes > 0,
      syncEveryMinutes,
      ...patch,
    })
  });
  renderPilot();
}

$('#pilotToggle').addEventListener('click', async () => {
  if (!PILOT) return;
  await savePilot({ enabled: !PILOT.enabled });
  toast(PILOT.enabled ? `Piloto activo: cada día a las ${PILOT.time}` : 'Piloto apagado');
});
$('#pilotTime').addEventListener('change', async () => {
  if (!PILOT) return;
  await savePilot({});
  toast('Primer pase: ' + PILOT.time);
});
$('#pilotMode').addEventListener('change', async () => {
  if (!PILOT) return;
  await savePilot({});
  toast(PILOT.mode === 'publish' ? 'El piloto publicará al FTP' : 'El piloto preparará para revisar');
});
$('#pilotSync').addEventListener('change', async () => {
  if (!PILOT) return;
  await savePilot({});
  toast(syncLabel(PILOT.liveSync ? PILOT.syncEveryMinutes : 0));
});
$('#pilotRun').addEventListener('click', async (e) => {
  const b = e.target;
  b.disabled = true;
  b.textContent = 'Preparando...';
  try {
    const r = await api('/autopilot/run', { method: 'POST', body: JSON.stringify({ publish: false, sync: true }) });
    toast(`Listo para revisar: ${r.cards} cartela(s).`);
    load();
    loadPilot();
  } catch (err) {
    toast('Error: ' + err.message);
  } finally {
    b.disabled = false;
    b.textContent = 'Preparar ahora';
  }
});
$('#pilotPublishNow').addEventListener('click', async (e) => {
  const b = e.target;
  if (!confirm('¿Generar y subir ahora los 8 MP4 al FTP?')) return;
  b.disabled = true;
  b.textContent = 'Publicando...';
  try {
    const r = await api('/autopilot/run', { method: 'POST', body: JSON.stringify({ publish: true, sync: true }) });
    toast(r.published ? `Publicado: ${r.cards} cartela(s).` : 'No se pudo publicar. Mira Estado.');
    load();
    loadPilot();
  } catch (err) {
    toast('Error: ' + err.message);
  } finally {
    b.disabled = false;
    b.textContent = 'Publicar ahora';
  }
});
$('#pilotReview').addEventListener('click', () => { location.href = '/review.html'; });

// --- Barra de acciones ---
$('#btnAdd').addEventListener('click', () => openEditor(null));
$('#btnRefresh').addEventListener('click', load);
$('#btnImport').addEventListener('click', async () => {
  const r = await api('/import', { method: 'POST' });
  toast(`Worker: ${r.added.length} nuevo(s) de ${r.scanned}`); load();
});

// --- 🚨 Última hora: URL o titular → alerta primera del bucle → revisar → publicar ---
const breakingDlg = $('#breakingDlg');
$('#btnBreaking').addEventListener('click', () => {
  $('#bkInput').value = '';
  breakingDlg.showModal();
  setTimeout(() => $('#bkInput').focus(), 60);
});
$('#bkInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $('#bkGo').click(); } });
$('#bkGo').addEventListener('click', async () => {
  const v = $('#bkInput').value.trim();
  if (!v) { toast('Pega una URL o escribe el titular'); return; }
  const b = $('#bkGo');
  b.disabled = true;
  b.textContent = '⏳ Creando la alerta…';
  try {
    const body = /^https?:\/\//i.test(v) ? { url: v } : { title: v };
    await api('/breaking', { method: 'POST', body: JSON.stringify(body) });
    breakingDlg.close();
    toast('Última hora creada en primera posición. Revise el plan y confirme.');
    await load();
    preparePublish();
  } catch (e) {
    toast('Error: ' + e.message);
  } finally {
    b.disabled = false;
    b.textContent = 'Crear y revisar →';
  }
});

// --- Escaleta editorial ---
const rundownDlg = $('#rundownDlg');
let RD_DIRTY = false;   // hay cambios sin guardar en escaleta/contenido
let LIB_OPEN = -1;      // índice de la pieza expandida en la lista
let RD_STAMP = Date.now(); // cache-bust de las miniaturas del storyboard
let RD_PLAN_DAYS = 7;      // días que enseña el planificador (lo fija el asistente)

// Catálogo del asistente "Planificar días": tipos de cartela predeterminados.
const PLAN_TYPES = [
  { id: 'tiempo', label: 'Tiempo ahora · automático', def: true, slot: { source: 'worker', workerKey: 'weather', template: 'clima', label: 'Tiempo ahora', rotation: 'hora' } },
  { id: 'prevision', label: 'Previsión 3 días · automático', def: true, slot: { source: 'worker', workerKey: 'forecast', template: 'prevision', label: 'Previsión' } },
  { id: 'agenda', label: 'Agenda viva · programable', def: true, duration: 10, slot: { source: 'library', libraryKey: 'agendaEventos', label: 'Agenda' } },
  { id: 'curioso', label: 'Dato curioso · carrusel', def: true, slot: { source: 'library', libraryKey: 'datosCuriosos', label: 'Dato curioso' } },
  { id: 'utiles', label: 'Aviso útil · carrusel', slot: { source: 'library', libraryKey: 'datosUtiles', label: 'Aviso útil' } },
  { id: 'consejo', label: 'Consejo informático (Fast2Computer) · carrusel', slot: { source: 'library', libraryKey: 'consejosInformaticos', label: 'Consejo informático' } },
  { id: 'luz', label: 'Precio de la luz · automático', slot: { source: 'worker', workerKey: 'powerPrice', label: 'Precio de la luz' } },
  { id: 'gasolina', label: 'Gasolineras más baratas · automático', slot: { source: 'worker', workerKey: 'fuel', label: 'Gasolina más barata' } },
  { id: 'aire', label: 'Calidad del aire · automático', slot: { source: 'worker', workerKey: 'airQuality', template: 'aire', label: 'Calidad del aire' } },
  { id: 'piscinas', label: 'Aforo piscinas · manual', slot: { source: 'worker', workerKey: 'poolCapacity', template: 'dato', label: 'Aforo piscinas', subtitle: 'Personas en las piscinas' } },
  { id: 'ultima', label: 'Última hora · reservado (desactivado)', enabled: false, slot: { source: 'fixed', template: 'alerta', label: 'Última hora', subtitle: 'ÚLTIMA HORA' } },
];

function rdSetDirty(v) {
  RD_DIRTY = v;
  $('#btnRundownSave').textContent = v ? 'Guardar cambios ●' : 'Guardar cambios';
}

function setRundownTab(tab) {
  $('#rdTabSeq').hidden = tab !== 'seq';
  $('#rdTabLib').hidden = tab !== 'lib';
  document.querySelectorAll('[data-rd-tab]').forEach((b) => b.classList.toggle('sel', b.dataset.rdTab === tab));
}

async function openRundown() {
  const today = localDatePart();
  RUNDOWN = await api('/rundown?date=' + encodeURIComponent($('#rundownDate').value || today));
  RUNDOWN_SELECTED = -1; // nada seleccionado: solo el storyboard
  LIB_OPEN = -1;
  RD_STAMP = Date.now();
  rdSetDirty(false);
  setRundownTab('seq');
  renderRundown();
  rundownDlg.showModal();
}

function reportForSlot(slot) {
  return ((RUNDOWN && RUNDOWN.report) || []).find((r) => r.id === slot.id) || {};
}

function renderRundown() {
  if (!RUNDOWN) return;
  const rd = RUNDOWN.rundown || { slots: [] };
  const slots = rd.slots || [];
  if (RUNDOWN_SELECTED >= slots.length) RUNDOWN_SELECTED = -1;
  $('#rundownTitle').value = rd.title || 'Escaleta';
  $('#rundownDate').value = RUNDOWN.activeDate || localDatePart();
  const rep = RUNDOWN.report || [];
  const emits = (s, i) => s.enabled !== false && !(rep[i] && (rep[i].skippedToday || rep[i].autoSkipped));
  const active = slots.filter(emits).length;
  const missing = rep.filter((r) => r.missing).length;
  const secs = slots.reduce((n, s, i) => n + (emits(s, i) ? (Number(s.duration) || 8) : 0), 0);
  $('#rundownSummary').innerHTML =
    `La pantalla dará una vuelta de <b>${secs}s</b> con <b>${active}</b> bloques` +
    (missing ? ` · <b style="color:#e0a106">⚠ ${missing} sin contenido</b>` : ' · <b style="color:#bff0d5">todo listo ✓</b>') +
    (RUNDOWN.dayTheme ? ` · color del día: <b>${esc(RUNDOWN.dayTheme)}</b>` : '');
  $('#slotList').innerHTML = slots.length
    ? slots.map((s, i) => sbCardHtml(s, i)).join('')
    : '<div class="empty" style="grid-column:1/-1">Añade un bloque para empezar.</div>';
  renderSlotEditor();
  renderLibraryPanel();
}

function selectedSlot() {
  const slots = (RUNDOWN && RUNDOWN.rundown && RUNDOWN.rundown.slots) || [];
  return slots[RUNDOWN_SELECTED] || null;
}

// STORYBOARD: cada bloque es una tarjeta con su miniatura REAL (el último
// render de esa posición), número de emisión y qué dirá ese día.
function sbCardHtml(s, i) {
  const rep = reportForSlot(s);
  const keys = RUNDOWN.libraryKeys || [];
  const libLabel = (k) => (keys.find((x) => x.key === k) || {}).label || k;
  const srcIco = s.source === 'library' ? '🔁' : (s.source === 'worker' ? '⚙️' : '✍️');
  const srcTitle = s.source === 'library' ? `Carrusel de «${libLabel(s.libraryKey)}»: cambia cada ${s.rotation === 'hora' ? 'hora' : 'día'}`
    : (s.source === 'worker' ? 'Automático: se rellena solo con datos reales' : 'Escrito por ti');
  const say = rep.skippedToday ? 'no se emite este día'
    : (rep.autoSkipped ? 'sin agenda activa ahora'
    : (rep.missing ? (rep.note || 'sin contenido todavía') : (rep.title || s.title || '—')));
  const closed = s.enabled === false || rep.skippedToday || rep.autoSkipped;
  const sel = i === RUNDOWN_SELECTED;
  return `<button type="button" class="sb-card ${sel ? 'sel' : ''} ${closed ? 'off' : ''} ${rep.missing ? 'missing' : ''}" data-slot-open="${i}" title="${esc(srcTitle)}">
    <div class="sb-thumb">${srcIco}
      <img src="/media/output/rd_${encodeURIComponent(s.id)}.jpg?v=${RD_STAMP}" alt="" loading="lazy" onerror="this.remove()">
      <span class="sb-num">${String(i + 1).padStart(2, '0')}</span>
      <span class="sb-dur">${Number(s.duration) || 8}s${s.video ? ' ▶' : ''}</span>
    </div>
    <div class="sb-meta">
      <div class="sb-name">${srcIco} ${esc(s.label)}${s.enabled === false ? ' · APAGADO' : (rep.skippedToday ? ' · HOY NO' : (rep.autoSkipped ? ' · SIN AGENDA' : ''))}</div>
      <div class="sb-say ${rep.missing ? 'warn' : ''}">${rep.missing ? '⚠ ' : ''}${esc(say)}</div>
    </div>
  </button>`;
}

// Editor del bloque seleccionado, debajo del storyboard.
function renderSlotEditor() {
  const box = $('#slotEditor');
  const s = selectedSlot();
  if (!s) { box.hidden = true; box.innerHTML = ''; return; }
  box.hidden = false;
  box.innerHTML = `
    <div class="slot-editor-h">
      <b>${esc(s.label)} · bloque ${String(RUNDOWN_SELECTED + 1).padStart(2, '0')}</b>
      <button type="button" class="ghost" data-rd-close title="Cerrar el editor">✕</button>
    </div>` + slotEditHtml(s, RUNDOWN_SELECTED);
}

function slotEditHtml(s, i) {
  const rep = reportForSlot(s);
  const keys = RUNDOWN.libraryKeys || [];
  const slots = (RUNDOWN.rundown && RUNDOWN.rundown.slots) || [];
  const isLib = s.source === 'library';
  const isWorker = s.source === 'worker';
  const tplSelect = `<label>Plantilla<select data-rd-current="template">
      <option value="">Auto</option>
      ${TEMPLATES.map((t) => `<option value="${esc(t.id)}" ${t.id === s.template ? 'selected' : ''}>${esc(t.label)}</option>`).join('')}
    </select></label>`;
  return `
    <div class="slot-grid">
      <label>Nombre del bloque<input data-rd-current="label" value="${esc(s.label)}"></label>
      <label>Origen del contenido<select data-rd-current="source">
        <option value="fixed" ${s.source === 'fixed' ? 'selected' : ''}>✍️ Manual</option>
        <option value="library" ${isLib ? 'selected' : ''}>🔁 Carrusel</option>
        <option value="worker" ${isWorker ? 'selected' : ''}>⚙️ Dato automático</option>
      </select></label>
      ${isLib ? `<label>Tipo de carrusel<select data-rd-current="libraryKey">
        ${keys.map((k) => `<option value="${esc(k.key)}" ${k.key === s.libraryKey ? 'selected' : ''}>${esc(k.label)}</option>`).join('')}
      </select></label>
      <label>Cambia de pieza<select data-rd-current="rotation">
        <option value="dia" ${s.rotation !== 'hora' ? 'selected' : ''}>Cada día</option>
        <option value="hora" ${s.rotation === 'hora' ? 'selected' : ''}>Cada hora</option>
      </select></label>` : ''}
      ${isWorker ? (() => {
        const ws = RUNDOWN.workers || [];
        const known = ws.some((w) => w.key === s.workerKey);
        const sel = ws.map((w) =>
          `<option value="${esc(w.key)}" ${w.key === s.workerKey ? 'selected' : ''}>${esc(w.label)}${w.fresh && w.preview ? ' — ' + esc(w.preview) : (w.fresh ? '' : ' (sin datos aún)')}</option>`).join('');
        return `<label>Dato automático<select data-rd-current="workerKey">
          ${known ? '' : `<option value="${esc(s.workerKey || '')}" selected>${esc(s.workerKey || 'elige uno…')}</option>`}${sel}
        </select></label>`;
      })() : ''}
      ${!isLib && !isWorker ? tplSelect : ''}
      ${isLib
        ? (() => {
          const items = (RUNDOWN.library && RUNDOWN.library[s.libraryKey]) || [];
          const list = items.map((p, idx) =>
            `<label class="chk"><input type="checkbox" data-lib-enable="${esc(s.libraryKey)}:${idx}" ${p.enabled !== false ? 'checked' : ''}>${esc(p.title || p.body || '(sin título)')}</label>`).join('');
          return `<div class="slot-wide">
            <label>Piezas del carrusel (marcadas = en emisión)</label>
            <div style="max-height:200px;overflow:auto;border:1px solid var(--line);border-radius:10px;padding:6px 10px">${list || '<div class="hint">Sin piezas. Añádalas en la pestaña «Carrusel».</div>'}</div>
            <div class="hint" style="margin-top:4px">${s.rotation === 'hora' ? 'Cambia de pieza cada hora; con la publicación automática activa se emite un pase horario.' : 'Cambia de pieza cada día, en ciclo, sin repetir.'} Crear o programar piezas: pestaña «Carrusel».</div>
          </div>`;
        })()
        : (isWorker
          ? `<div class="slot-wide hint" style="align-self:center">${s.workerKey === 'weather' ? 'Contenido automático: se refresca cada hora y antes de publicar si toca.' : 'Contenido automático: se refresca cuando caduca el dato y antes de publicar.'}</div>`
          : `<label>Título<input data-rd-current="title" value="${esc(s.title || '')}"></label>
      <label>Subtítulo<input data-rd-current="subtitle" value="${esc(s.subtitle || '')}"></label>
      <label class="slot-wide">Texto<textarea data-rd-current="body">${esc(s.body || '')}</textarea></label>`)}
      <label>Duración (segundos)<input type="number" min="1" data-rd-current="duration" value="${Number(s.duration) || 8}"></label>
      <label><input type="checkbox" data-rd-toggle="enabled" ${s.enabled !== false ? 'checked' : ''} style="width:auto;margin-right:8px"> Activa (todos los días)</label>
      <label><input type="checkbox" data-rd-toggle="video" ${s.video ? 'checked' : ''} style="width:auto;margin-right:8px"> Animada (MP4)</label>
      <label class="slot-wide" style="color:#ffd98a"><input type="checkbox" data-rd-skipday ${((((RUNDOWN.rundown || {}).days || {})[RUNDOWN.activeDate] || {}).skip || []).includes(s.id) ? 'checked' : ''} style="width:auto;margin-right:8px">
        No emitir SOLO el ${esc(RUNDOWN.activeDate || 'día elegido')} (el resto de días sale con normalidad)</label>
    </div>
    <div class="status">${rep.autoSkipped
      ? 'Este bloque no se emitirá ahora: no hay una agenda activa en esta ventana.'
      : (rep.missing
      ? '⚠ ' + esc(rep.note || 'Pendiente de contenido')
      : `Programado para el ${esc(RUNDOWN.activeDate || 'día elegido')}: <b>${esc(rep.title || s.title || s.label)}</b>`)}</div>
    <div class="slot-tools">
      <button class="ghost" data-rd-move="-1" ${i === 0 ? 'disabled' : ''}>← Emitir antes</button>
      <button class="ghost" data-rd-move="1" ${i === slots.length - 1 ? 'disabled' : ''}>Emitir después →</button>
      <span class="spacer"></span>
      <button class="ghost" data-rd-delete-current>Eliminar bloque</button>
    </div>`;
}

function currentLibraryMeta() {
  const keys = RUNDOWN.libraryKeys || [];
  return keys.find((x) => x.key === LIBRARY_CATEGORY) || keys[0] || { key: LIBRARY_CATEGORY, label: 'Contenido', template: 'noticia', theme: '' };
}

function blankLibraryItem(meta) {
  return { title: '', subtitle: '', body: '', template: meta.template || 'noticia', theme: meta.theme || '', enabled: true, start: '', end: '', startAt: '', endAt: '', dates: [], weekdays: [] };
}

function blankAgendaLibraryItem() {
  const meta = (RUNDOWN.libraryKeys || []).find((k) => k.key === 'agendaEventos') || { template: 'agenda', theme: 'blanco' };
  const active = RUNDOWN.activeDate || localDatePart();
  const blocks = ((RUNDOWN.library || {}).agendaEventos || [])
    .map((item, idx) => agendaRangeForDay(item, active, idx))
    .filter(Boolean)
    .sort((a, b) => a.start - b.start);
  let startMin = 8 * 60;
  let endMin = 9 * 60;
  let cursor = 8 * 60;
  let placed = false;
  for (const b of blocks) {
    if (b.start - cursor >= 30) {
      startMin = cursor;
      endMin = Math.min(cursor + 60, b.start);
      placed = true;
      break;
    }
    cursor = Math.max(cursor, b.end);
  }
  if (!placed && blocks.length) {
    startMin = cursor < 22 * 60 ? cursor : blocks[blocks.length - 1].end;
    endMin = Math.min(startMin + 60, 24 * 60);
  }
  const startAt = dtLocal(active, inputTimeLabel(startMin));
  const endAt = dtLocal(active, inputTimeLabel(endMin));
  return {
    ...blankLibraryItem(meta),
    title: '',
    subtitle: 'Hoy',
    body: '',
    template: 'agenda',
    theme: 'blanco',
    startAt,
    endAt,
  };
}

function clientDayNumber(date) {
  const jsDay = new Date(`${date}T12:00:00`).getDay();
  return jsDay === 0 ? 7 : jsDay;
}

function clientItemApplies(item, date) {
  if (item.enabled === false) return false;
  const d = date || localDatePart();
  const dates = Array.isArray(item.dates) ? item.dates : [];
  const weekdays = Array.isArray(item.weekdays) ? item.weekdays.map(Number) : [];
  if (dates.length && !dates.includes(d)) return false;
  const now = new Date();
  const today = localDatePart();
  const dayStart = new Date(`${d}T00:00:00`);
  const dayEnd = new Date(`${d}T23:59:59`);
  if (item.startAt) {
    const startAt = new Date(item.startAt);
    if (!Number.isNaN(startAt.getTime()) && dayEnd < startAt) return false;
    if (d === today && !Number.isNaN(startAt.getTime()) && now < startAt) return false;
  }
  if (item.endAt) {
    const endAt = new Date(item.endAt);
    if (!Number.isNaN(endAt.getTime()) && dayStart > endAt) return false;
    if (d === today && !Number.isNaN(endAt.getTime()) && now > endAt) return false;
  }
  if (item.start && d < item.start) return false;
  if (item.end && d > item.end) return false;
  if (weekdays.length && !weekdays.includes(clientDayNumber(d))) return false;
  return true;
}

// ¿La pieza tiene alguna programación de fechas?
function isScheduled(item) {
  return Boolean((item.dates && item.dates.length) || (item.weekdays && item.weekdays.length) || item.start || item.end || item.startAt || item.endAt);
}

const WEEKDAY_SHORT = ['', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];

function fmtShortDate(d) {
  try { return new Date(d + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }); }
  catch { return d; }
}

function fmtMoment(v) {
  if (!v) return '';
  try {
    return new Date(v).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  } catch { return v; }
}

// Resumen legible de cuándo sale una pieza: "siempre", "1 jul – 31 ago · lun mié", "solo 15 jul"...
function scheduleSummary(item) {
  if (item.enabled === false) return 'desactivada';
  if (item.dates && item.dates.length) return 'solo ' + item.dates.map(fmtShortDate).join(', ');
  const parts = [];
  if (item.startAt && item.endAt) parts.push(`${fmtMoment(item.startAt)} – ${fmtMoment(item.endAt)}`);
  else if (item.startAt) parts.push(`desde ${fmtMoment(item.startAt)}`);
  else if (item.endAt) parts.push(`hasta ${fmtMoment(item.endAt)}`);
  if (item.start && item.end) parts.push(`${fmtShortDate(item.start)} – ${fmtShortDate(item.end)}`);
  else if (item.start) parts.push(`desde ${fmtShortDate(item.start)}`);
  else if (item.end) parts.push(`hasta ${fmtShortDate(item.end)}`);
  const wd = (item.weekdays || []).map(Number).filter(Boolean);
  if (wd.length && wd.length < 7) parts.push(wd.map((n) => WEEKDAY_SHORT[n]).join(' '));
  return parts.join(' · ') || 'siempre';
}

function addDays(dateStr, n) {
  const dt = new Date(dateStr + 'T12:00:00');
  dt.setDate(dt.getDate() + n);
  return localDatePart(dt);
}

function dtLocal(date, time) {
  return `${date}T${time}`;
}

function minuteOf(v) {
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.getHours() * 60 + d.getMinutes();
}

function minLabel(min) {
  const m = Math.max(0, Math.min(24 * 60, Math.round(min)));
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

function inputTimeLabel(min) {
  return min >= 24 * 60 ? '23:59' : minLabel(min);
}

function itemCanAppearOnDate(item, date) {
  const d = String(date || '').slice(0, 10);
  if (item.enabled === false) return false;
  if (Array.isArray(item.dates) && item.dates.length && !item.dates.includes(d)) return false;
  if (item.start && d < item.start) return false;
  if (item.end && d > item.end) return false;
  const weekdays = Array.isArray(item.weekdays) ? item.weekdays.map(Number) : [];
  if (weekdays.length && !weekdays.includes(clientDayNumber(d))) return false;
  const dayStart = new Date(`${d}T00:00:00`);
  const dayEnd = new Date(`${d}T23:59:59`);
  if (item.startAt) {
    const startAt = new Date(item.startAt);
    if (!Number.isNaN(startAt.getTime()) && dayEnd < startAt) return false;
  }
  if (item.endAt) {
    const endAt = new Date(item.endAt);
    if (!Number.isNaN(endAt.getTime()) && dayStart > endAt) return false;
  }
  return true;
}

function agendaRangeForDay(item, date, idx) {
  if (!itemCanAppearOnDate(item, date)) return null;
  let start = item.startAt ? minuteOf(item.startAt) : null;
  let end = item.endAt ? minuteOf(item.endAt) : null;
  if (item.startAt && String(item.startAt).slice(0, 10) < date) start = 0;
  if (item.endAt && String(item.endAt).slice(0, 10) > date) end = 24 * 60;
  if (start == null) start = 8 * 60;
  if (end == null) end = start + 60;
  if (end <= start) end = Math.min(24 * 60, start + 60);
  start = Math.max(0, Math.min(24 * 60, start));
  end = Math.max(start + 1, Math.min(24 * 60, end));
  return { idx, item, start, end, lane: 0 };
}

function agendaDatesFrom(startDate) {
  const start = startDate || localDatePart();
  const nDays = Math.max(1, Math.min(14, RD_PLAN_DAYS || 7));
  return Array.from({ length: nDays }, (_, i) => addDays(start, i));
}

function agendaSortKey(item, idx, startDate) {
  const dates = agendaDatesFrom(startDate);
  for (let d = 0; d < dates.length; d++) {
    const range = agendaRangeForDay(item, dates[d], idx);
    if (range) return d * 24 * 60 + range.start;
  }
  const at = Date.parse(item.startAt || item.start || '');
  if (!Number.isNaN(at)) return 1000000 + at / 60000;
  return 2000000 + idx;
}

function agendaViewItems(items, startDate) {
  return (items || [])
    .map((item, i) => ({ item, i, key: agendaSortKey(item, i, startDate) }))
    .sort((a, b) => a.key - b.key || String(a.item.title || '').localeCompare(String(b.item.title || ''), 'es') || a.i - b.i);
}

// Réplica exacta de la rotación del servidor: ciclo secuencial sin repetir.
function clientPickDaily(items, key, date) {
  if (!Array.isArray(items) || !items.length) return null;
  const epochDay = Math.floor(Date.parse(`${date}T12:00:00Z`) / 86400000);
  let off = 0;
  for (const ch of String(key)) off = (off + ch.charCodeAt(0)) % 9973;
  return items[(epochDay + off) % items.length];
}

// Réplica de libraryItems del servidor: pack del día + fechas exactas o programadas.
function clientLibraryItems(lib, key, date) {
  const daily = (lib.days && lib.days[date] && Array.isArray(lib.days[date][key])) ? lib.days[date][key] : [];
  const pool = Array.isArray(lib[key]) ? lib[key] : [];
  const exact = pool.filter((it) => it.enabled !== false && Array.isArray(it.dates) && it.dates.includes(date) && clientItemApplies(it, date));
  const scheduled = exact.length ? exact : pool.filter((it) => clientItemApplies(it, date));
  return [...daily, ...scheduled];
}

// Planificador: qué pieza saldrá en cada bloque programado los próximos 7 días.
function renderPlanner() {
  const box = $('#libraryPlanner');
  if (!box || !RUNDOWN) return;
  const slots = ((RUNDOWN.rundown || {}).slots || []).filter((s) => s.enabled !== false && s.source === 'library');
  if (!slots.length) { box.innerHTML = ''; return; }
  const start = RUNDOWN.activeDate || localDatePart();
  const lib = RUNDOWN.library || {};
  const nDays = Math.max(1, Math.min(14, RD_PLAN_DAYS));
  let html = `<label style="margin-top:12px">Qué saldrá los próximos ${nDays} día(s)</label><div class="planner">`;
  for (let d = 0; d < nDays; d++) {
    const date = addDays(start, d);
    const dayLabel = new Date(date + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
    const chips = slots.map((s) => {
      const item = clientPickDaily(clientLibraryItems(lib, s.libraryKey, date), s.id, date);
      return item
        ? `<span class="pl-chip" title="${esc(item.title || '')}"><b>${esc(s.label)}</b> · ${esc(item.title || item.body || '')}</span>`
        : `<span class="pl-chip warn"><b>${esc(s.label)}</b> · sin contenido</span>`;
    }).join('');
    html += `<div class="planner-day ${d === 0 ? 'today' : ''}"><b>${esc(dayLabel)}</b><div class="planner-items">${chips}</div></div>`;
  }
  box.innerHTML = html + '</div>';
}

function agendaTimelineDayHtml(items, date, dayIndex) {
  const blocks = (items || [])
    .map((item, idx) => agendaRangeForDay(item, date, idx))
    .filter(Boolean)
    .sort((a, b) => a.start - b.start || a.end - b.end);
  if (!blocks.length) {
    return `<div class="agenda-day ${dayIndex === 0 ? 'today' : ''}">
      <div class="agenda-day-title"><b>${esc(fmtShortDate(date))}</b><span>sin bloques</span></div>
      <div class="status">No hay nada programado para este día.</div>
    </div>`;
  }
  const minStart = Math.min(...blocks.map((b) => b.start));
  const maxEnd = Math.max(...blocks.map((b) => b.end));
  let start = Math.max(0, Math.floor((minStart - 60) / 60) * 60);
  let end = Math.min(24 * 60, Math.ceil((maxEnd + 60) / 60) * 60);
  if (end - start < 4 * 60) end = Math.min(24 * 60, start + 4 * 60);
  const span = Math.max(1, end - start);
  const lanes = [];
  blocks.forEach((b) => {
    let lane = lanes.findIndex((until) => until <= b.start);
    if (lane < 0) { lane = lanes.length; lanes.push(0); }
    b.lane = lane;
    lanes[lane] = b.end;
  });
  const markerStep = span <= 6 * 60 ? 60 : (span <= 12 * 60 ? 120 : 180);
  const markers = [];
  for (let m = Math.ceil(start / markerStep) * markerStep; m <= end; m += markerStep) {
    markers.push(`<span class="agenda-time-mark" style="left:${((m - start) / span) * 100}%">${minLabel(m)}</span>`);
  }
  const gaps = [];
  let cursor = start;
  blocks.forEach((b) => {
    if (b.start - cursor >= 15) {
      gaps.push({ start: cursor, end: b.start });
    }
    cursor = Math.max(cursor, b.end);
  });
  if (end - cursor >= 15) gaps.push({ start: cursor, end });
  const gapHtml = gaps.map((g) => `<div class="agenda-gap" style="left:${((g.start - start) / span) * 100}%;width:${((g.end - g.start) / span) * 100}%"><span>hueco ${minLabel(g.start)}-${minLabel(g.end)}</span></div>`).join('');
  const blockHtml = blocks.map((b) => {
    const left = ((b.start - start) / span) * 100;
    const width = Math.max(3, ((b.end - b.start) / span) * 100);
    const label = (b.item.title || b.item.body || '(sin rellenar)').split(/\r?\n/)[0];
    return `<button type="button" class="agenda-time-block ${b.idx === LIB_OPEN ? 'open' : ''} ${String(b.item.body || b.item.title || '').trim() ? '' : 'empty'}" data-agenda-time-open="${b.idx}" style="left:${left}%;width:${width}%;top:${8 + b.lane * 54}px">
      <b>${minLabel(b.start)}-${minLabel(b.end)}</b><span>${esc(label)}</span>
    </button>`;
  }).join('');
  return `<div class="agenda-day ${dayIndex === 0 ? 'today' : ''}">
    <div class="agenda-day-title"><b>${esc(fmtShortDate(date))}</b><span>${blocks.length} bloque(s)</span></div>
    <div class="agenda-time-scroll">
      <div class="agenda-time-scale">${markers.join('')}</div>
      <div class="agenda-time-track" style="height:${Math.max(70, lanes.length * 54 + 8)}px">${gapHtml}${blockHtml}</div>
    </div>
  </div>`;
}

function renderAgendaTimeline(items, date) {
  const box = $('#libraryPlanner');
  if (!box) return;
  const dates = agendaDatesFrom(date);
  const hasBlocks = dates.some((d) => (items || []).some((item, idx) => agendaRangeForDay(item, d, idx)));
  if (!hasBlocks) {
    box.innerHTML = `<div class="agenda-timeline"><div class="status"><b>Sin bloques visibles en los próximos ${dates.length} días.</b> Añade un bloque de agenda para ver la línea de tiempo.</div></div>`;
    return;
  }
  box.innerHTML = `<div class="agenda-timeline">
    <div class="agenda-timeline-head"><b>Línea de tiempo</b><span>próximos ${dates.length} día(s) · los huecos quedan marcados en amarillo</span></div>
    ${dates.map((d, i) => agendaTimelineDayHtml(items, d, i)).join('')}
  </div>`;
}

function renderLibraryPanel() {
  const keys = RUNDOWN.libraryKeys || [];
  if (!keys.some((x) => x.key === LIBRARY_CATEGORY) && keys[0]) LIBRARY_CATEGORY = keys[0].key;
  $('#libraryCategory').innerHTML = keys.map((meta) => `<option value="${esc(meta.key)}" ${meta.key === LIBRARY_CATEGORY ? 'selected' : ''}>${esc(meta.label)}</option>`).join('');
  const meta = currentLibraryMeta();
  const isAgenda = meta.key === 'agendaEventos';
  const items = (RUNDOWN.library && Array.isArray(RUNDOWN.library[meta.key])) ? RUNDOWN.library[meta.key] : [];
  const activeDate = RUNDOWN.activeDate || localDatePart();
  const eligible = items.filter((item) => clientItemApplies(item, activeDate)).length;
  const viewItems = isAgenda ? agendaViewItems(items, activeDate) : items.map((item, i) => ({ item, i }));
  const libTitle = document.querySelector('#rdTabLib .library-head h3');
  if (libTitle) libTitle.textContent = isAgenda ? 'Agenda viva' : 'Carrusel';
  $('#btnLibraryAdd').textContent = isAgenda ? '＋ Añadir bloque de agenda' : '＋ Añadir pieza';
  $('#btnLibraryAdd').title = isAgenda ? 'Crea una tarjeta nueva de Agenda viva con horario propio.' : 'Añade una pieza a este carrusel.';
  $('#librarySummary').innerHTML =
    isAgenda
      ? `<b>${items.length}</b> bloque(s) de agenda · <b style="color:${eligible ? '#bff0d5' : '#ffd98a'}">${eligible}</b> pueden salir el ${esc(fmtShortDate(activeDate))}`
      : `<b>${items.length}</b> pieza(s) en esta categoría · <b style="color:${eligible ? '#bff0d5' : '#ffd98a'}">${eligible}</b> pueden salir el ${esc(fmtShortDate(activeDate))}`;
  if (isAgenda) renderAgendaTimeline(items, activeDate);
  else renderPlanner();
  $('#libraryList').innerHTML = items.length ? viewItems.map(({ item, i }) => libraryItemHtml(meta, item, i)).join('') :
    `<div class="empty">Esta categoría está vacía. ${isAgenda ? 'Añade un bloque de agenda.' : 'Añade una pieza o importa un lote.'}</div>`;
}

function weekdayBox(item, n, label) {
  const on = Array.isArray(item.weekdays) && item.weekdays.map(Number).includes(n);
  return `<label><input type="checkbox" data-lib-weekday="${n}" ${on ? 'checked' : ''}>${label}</label>`;
}

function libraryItemHtml(meta, item, i) {
  const isAgenda = meta.key === 'agendaEventos';
  const isCurious = meta.key === 'datosCuriosos';
  const subtitleLabel = isAgenda ? 'Etiqueta' : (isCurious ? 'Cabecera superior' : 'Firma/sección');
  const head = `<button type="button" class="lib-row" data-lib-open="${i}">
      <span class="lib-dot ${item.enabled !== false ? 'on' : ''}"></span>
      <span class="lib-title">${esc(item.title || item.body || (isAgenda ? '(bloque de agenda sin rellenar)' : '(sin título)'))}</span>
      <span class="lib-when">${esc(scheduleSummary(item))}</span>
    </button>`;
  if (i !== LIB_OPEN) {
    return `<div class="library-item ${item.enabled === false ? 'off' : ''}" data-lib-item="${i}">${head}</div>`;
  }
  const sched = isScheduled(item);
  return `<div class="library-item ${item.enabled === false ? 'off' : ''}" data-lib-item="${i}">
    ${head}
    <div class="lib-edit">
      <div class="mini">
        <label>${isAgenda ? 'Cabecera' : 'Título'}<input data-lib-field="title" value="${esc(item.title || '')}" placeholder="${isAgenda ? 'Agenda, Ahora en..., Mañana...' : ''}"></label>
        <label>${subtitleLabel}<input data-lib-field="subtitle" value="${esc(item.subtitle || '')}" placeholder="${isAgenda ? 'Hoy, Mañana, Festival...' : (isCurious ? 'Lo que quieras que aparezca arriba' : '')}"></label>
      </div>
      <label>${isAgenda ? 'Eventos del bloque' : 'Texto'}<textarea data-lib-field="body" placeholder="${isAgenda ? '21:00 | Concierto | Plaza Nueva\\n22:30 | DJ set | Casco Viejo' : ''}">${esc(item.body || '')}</textarea></label>
      <label>¿Cuándo sale?
        <select data-lib-mode>
          <option value="always" ${!sched ? 'selected' : ''}>Siempre (en el carrusel con las demás)</option>
          <option value="scheduled" ${sched ? 'selected' : ''}>Solo cuando lo programe</option>
        </select>
      </label>
      <div class="lib-sched" ${sched ? '' : 'hidden'}>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin:6px 0 8px">
          <button type="button" class="ghost" data-quick-time="now">Sale desde ahora</button>
          <button type="button" class="ghost" data-quick-time="tonight">Quitar a las 22:00</button>
          <button type="button" class="ghost" data-quick-time="tomorrow1320">Mañana 13:20</button>
          <button type="button" class="ghost" data-quick-time="tomorrow1342">Mañana 13:42</button>
        </div>
        <div class="mini">
          <label>Empieza a salir<input type="datetime-local" data-lib-field="startAt" value="${esc(item.startAt || '')}"></label>
          <label>Deja de salir<input type="datetime-local" data-lib-field="endAt" value="${esc(item.endAt || '')}"></label>
        </div>
        <div class="hint">${isAgenda ? 'Este bloque sale solo dentro de esta ventana. Si añades otro después, evita solaparlos.' : 'Para agenda: pon “deja de salir” cuando el evento ya no tenga sentido. Puedes dejar preparado mañana desde ahora.'}</div>
        <div class="mini">
          <label>Desde<input type="date" data-lib-field="start" value="${esc(item.start || '')}"></label>
          <label>Hasta<input type="date" data-lib-field="end" value="${esc(item.end || '')}"></label>
        </div>
        <label>Días de la semana (vacío = todos)</label>
        <div class="weekdays">${weekdayBox(item, 1, 'L')}${weekdayBox(item, 2, 'M')}${weekdayBox(item, 3, 'X')}${weekdayBox(item, 4, 'J')}${weekdayBox(item, 5, 'V')}${weekdayBox(item, 6, 'S')}${weekdayBox(item, 7, 'D')}</div>
        <label>Solo fechas concretas<input data-lib-field="dates" value="${esc((item.dates || []).join(', '))}" placeholder="2026-07-15, 2026-08-04"></label>
        <div class="hint">Con fechas concretas, la pieza sale SOLO esos días y desplaza al resto del carrusel.</div>
      </div>
      <div class="mini">
        <label>Plantilla<select data-lib-field="template">
          ${TEMPLATES.map((t) => `<option value="${esc(t.id)}" ${t.id === (item.template || meta.template) ? 'selected' : ''}>${esc(t.label)}</option>`).join('')}
        </select></label>
        <label>Tema de color<select data-lib-field="theme">
          <option value="" ${!(item.theme || meta.theme) ? 'selected' : ''}>Auto</option>
          ${Object.keys(PALETTE).map((k) => `<option value="${esc(k)}" ${k === (item.theme || meta.theme) ? 'selected' : ''}>${esc(k)}</option>`).join('')}
        </select></label>
      </div>
      <label>Notas internas<input data-lib-field="notes" value="${esc(item.notes || '')}"></label>
      <div class="slot-tools">
        <label style="margin:0"><input type="checkbox" data-lib-field="enabled" ${item.enabled !== false ? 'checked' : ''} style="width:auto;margin-right:6px">Activa</label>
        <span class="spacer"></span>
        <button type="button" class="ghost" data-lib-del>Quitar pieza</button>
      </div>
    </div>
  </div>`;
}

// Recoge del DOM SOLO el bloque en edición (los demás no tienen campos).
function collectRundown() {
  const rd = RUNDOWN.rundown || { slots: [] };
  rd.title = $('#rundownTitle').value.trim() || 'Escaleta';
  const slot = selectedSlot();
  const wrap = slot && !$('#slotEditor').hidden ? $('#slotEditor') : null;
  if (slot && wrap) {
    wrap.querySelectorAll('[data-rd-current]').forEach((el) => {
      const key = el.dataset.rdCurrent;
      slot[key] = key === 'duration' ? Number(el.value) || 8 : el.value;
    });
    wrap.querySelectorAll('[data-rd-toggle]').forEach((el) => {
      slot[el.dataset.rdToggle] = el.checked;
    });
    // Salto SOLO para el día visible (no toca el estado global del bloque).
    const sd = wrap.querySelector('[data-rd-skipday]');
    if (sd) {
      const d = RUNDOWN.activeDate || localDatePart();
      if (!rd.days || typeof rd.days !== 'object') rd.days = {};
      const rec = rd.days[d] && typeof rd.days[d] === 'object' ? rd.days[d] : { skip: [] };
      rec.skip = Array.isArray(rec.skip) ? rec.skip.filter((x) => x !== slot.id) : [];
      if (sd.checked) rec.skip.push(slot.id);
      rd.days[d] = rec;
    }
  }
  return rd;
}

// Recoge SOLO la pieza expandida del DOM al modelo (las demás no tienen campos).
function collectLibraryCategory() {
  if (!RUNDOWN || !RUNDOWN.library || LIB_OPEN < 0) return;
  const meta = currentLibraryMeta();
  const arr = RUNDOWN.library[meta.key];
  const wrap = $('#libraryList') && $('#libraryList').querySelector(`[data-lib-item="${LIB_OPEN}"] .lib-edit`);
  if (!wrap || !Array.isArray(arr) || !arr[LIB_OPEN]) return;
  const obj = arr[LIB_OPEN];
  wrap.querySelectorAll('[data-lib-field]').forEach((field) => {
    const key = field.dataset.libField;
    if (field.type === 'checkbox') obj[key] = field.checked;
    else if (key === 'dates') obj[key] = field.value.split(/[,\s]+/).map((x) => x.trim()).filter(Boolean);
    else obj[key] = field.value;
  });
  obj.weekdays = [...wrap.querySelectorAll('[data-lib-weekday]:checked')].map((field) => Number(field.dataset.libWeekday));
  const mode = wrap.querySelector('[data-lib-mode]');
  if (mode && mode.value === 'always') { obj.start = ''; obj.end = ''; obj.startAt = ''; obj.endAt = ''; obj.dates = []; obj.weekdays = []; }
}

function sortAgendaLibraryForSave(startDate) {
  if (!RUNDOWN || !RUNDOWN.library || !Array.isArray(RUNDOWN.library.agendaEventos)) return;
  const openItem = RUNDOWN.library.agendaEventos[LIB_OPEN] || null;
  RUNDOWN.library.agendaEventos = agendaViewItems(RUNDOWN.library.agendaEventos, startDate).map(({ item }) => item);
  if (openItem) LIB_OPEN = RUNDOWN.library.agendaEventos.indexOf(openItem);
}

function parseWeekdays(text) {
  const src = String(text || '').toUpperCase();
  const map = { L: 1, M: 2, X: 3, J: 4, V: 5, S: 6, D: 7 };
  const nums = [];
  for (const part of src.split(/[,\s]+/).filter(Boolean)) {
    if (/^[1-7]$/.test(part)) nums.push(Number(part));
    else for (const ch of part) if (map[ch]) nums.push(map[ch]);
  }
  return [...new Set(nums)];
}

function parseBulkItems(text, meta) {
  const raw = text.trim();
  if (!raw) return [];
  if (raw[0] === '[') {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map((x) => ({ ...blankLibraryItem(meta), ...x })) : [];
  }
  return raw.split(/\r?\n/).map((line) => {
    const parts = line.split('|').map((x) => x.trim());
    return {
      ...blankLibraryItem(meta),
      title: parts[0] || '',
      subtitle: parts[1] || '',
      body: parts[2] || '',
      start: parts[3] || '',
      end: parts[4] || '',
      weekdays: parseWeekdays(parts[5] || ''),
      dates: (parts[6] || '').split(/[,\s]+/).map((x) => x.trim()).filter(Boolean),
      startAt: parts[7] || '',
      endAt: parts[8] || '',
    };
  }).filter((item) => item.title || item.body);
}

// Guarda TODO de una vez: secuencia + contenido programado.
async function saveAllRundown(opts = {}) {
  const date = $('#rundownDate').value || localDatePart();
  collectRundown();
  collectLibraryCategory();
  sortAgendaLibraryForSave(date);
  const rd = RUNDOWN.rundown;
  const lib = RUNDOWN.library;
  await api('/rundown?date=' + encodeURIComponent(date), { method: 'PUT', body: JSON.stringify(rd) });
  RUNDOWN = await api('/rundown/library?date=' + encodeURIComponent(date), { method: 'PUT', body: JSON.stringify(lib) });
  // Re-materializa las cartelas del día visible para que los cambios de tema/
  // plantilla/contenido se reflejen: la cartela afectada queda marcada como
  // "cambios sin aplicar" (⟳) en el panel. Si se está planificando otro día,
  // NO se tocan las cartelas en emisión (para eso está "Aplicar escaleta").
  const today = localDatePart();
  if (opts.materialize !== false && date === today) {
    await api('/rundown/materialize', { method: 'POST', body: JSON.stringify({ date }) });
    load();
  }
  rdSetDirty(false);
  renderRundown();
  if (!opts.silent) toast('Guardado. Las cartelas con cambios quedan marcadas para regenerar (⟳)');
}

async function makeRundown() {
  const btn = $('#btnRundownMake');
  btn.disabled = true;
  try {
    await saveAllRundown({ silent: true, materialize: false });
    const date = $('#rundownDate').value || localDatePart();
    const r = await api('/rundown/materialize', { method: 'POST', body: JSON.stringify({ date }) });
    toast(`Escaleta aplicada: ${r.count} cartela(s). Revisa y pulsa Publicar.`);
    rundownDlg.close();
    load();
  } finally {
    btn.disabled = false;
  }
}

function confirmDiscard() {
  return !RD_DIRTY || confirm('Hay cambios sin guardar en la escaleta. ¿Salir sin guardarlos?');
}

// ====== ASISTENTE EN 3 PASOS: la puerta principal de la escaleta ======
// 1) elegir tipos y días · 2) revisar/rellenar contenido · 3) guardar + vista previa
const wizardDlg = $('#wizardDlg');
let WZ = null;

async function openWizard() {
  RUNDOWN = await api('/rundown'); // trae almacén, workers y claves
  WZ = { step: 1, days: 3, sel: new Set(PLAN_TYPES.filter((t) => t.def).map((t) => t.id)), manual: {}, adds: {}, agenda: initialAgendaMoments() };
  renderWizard();
  wizardDlg.showModal();
}

function wzWorkerLine(key) {
  const w = (RUNDOWN.workers || []).find((x) => x.key === key);
  if (!w) return 'Contenido automático.';
  return w.fresh && w.preview ? `Dato actual: ${w.preview}` : 'Sin datos aún; se obtienen automáticamente.';
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function localDatePart(dt = new Date()) {
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
}

function localDateTimePart(dt = new Date()) {
  return `${localDatePart(dt)}T${pad2(dt.getHours())}:${pad2(dt.getMinutes())}`;
}

function dateAtTime(date, time) {
  return `${date}T${time}`;
}

function addMinutesLocal(dt, minutes) {
  const d = new Date(dt || `${agendaBaseDate()}T08:00`);
  if (Number.isNaN(d.getTime())) return '';
  d.setMinutes(d.getMinutes() + minutes);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function agendaBaseDate() {
  return (RUNDOWN && RUNDOWN.activeDate) || localDatePart();
}

function blankAgendaMoment(afterIndex = -1) {
  const today = agendaBaseDate();
  const prev = afterIndex >= 0 ? (WZ.agenda || [])[afterIndex] : (WZ && WZ.agenda && WZ.agenda.length ? WZ.agenda[WZ.agenda.length - 1] : null);
  const next = afterIndex >= 0 ? (WZ.agenda || [])[afterIndex + 1] : null;
  const startAt = (prev && (prev.endAt || prev.startAt)) || dateAtTime(today, '08:00');
  const endAt = (next && next.startAt && next.startAt > startAt) ? next.startAt : addMinutesLocal(startAt, 60);
  return { title: 'Agenda', subtitle: 'Hoy', body: '', startAt, endAt };
}

function initialAgendaMoments() {
  const today = agendaBaseDate();
  const items = (((RUNDOWN || {}).library || {}).agendaEventos || [])
    .filter((it) => it && it.enabled !== false)
    .map((it) => {
      const hasSchedule = Boolean(it.startAt || it.endAt || it.start || it.end || (Array.isArray(it.dates) && it.dates.length));
      return {
        title: it.title || 'Agenda',
        subtitle: it.subtitle || 'Hoy',
        body: it.body || '',
        startAt: it.startAt || (hasSchedule ? '' : dateAtTime(today, '08:00')),
        endAt: it.endAt || (hasSchedule ? '' : dateAtTime(today, '22:00')),
        start: it.start || '',
        end: it.end || '',
        dates: Array.isArray(it.dates) ? it.dates : [],
      };
    });
  if (items.length) return items;
  return [blankAgendaMoment()];
}

function agendaMomentSummary(m) {
  const when = scheduleSummary({ enabled: true, startAt: m.startAt, endAt: m.endAt, start: m.start, end: m.end, dates: m.dates || [] });
  const lines = String(m.body || '').split(/\r?\n/).filter((x) => x.trim()).length;
  return `${when} · ${lines || 0} evento(s)`;
}

function agendaMomentHtml(m, i) {
  const live = clientItemApplies({ enabled: true, startAt: m.startAt, endAt: m.endAt, start: m.start, end: m.end, dates: m.dates || [] }, agendaBaseDate());
  return `<div class="agenda-moment ${live ? 'live' : ''}" data-wz-agenda="${i}">
    <div class="agenda-moment-head">
      <b>${esc(agendaMomentSummary(m))}</b>
      <button type="button" class="ghost" data-wz-agenda-copy="${i}">Duplicar</button>
      <button type="button" class="ghost" data-wz-agenda-del="${i}" ${WZ.agenda.length <= 1 ? 'disabled' : ''}>Quitar</button>
    </div>
    <div class="agenda-quick">
      <button type="button" class="ghost" data-wz-agenda-quick="now" data-i="${i}">Sale ahora</button>
      <button type="button" class="ghost" data-wz-agenda-quick="tonight" data-i="${i}">Hasta las 22:00</button>
      <button type="button" class="ghost" data-wz-agenda-quick="tomorrow1320" data-i="${i}">Mañana 13:20</button>
      <button type="button" class="ghost" data-wz-agenda-quick="tomorrow1342" data-i="${i}">Mañana 13:42</button>
    </div>
    <div class="agenda-grid">
      <label>Título<input data-wz-agenda-field="title" value="${esc(m.title || '')}" placeholder="Agenda"></label>
      <label>Etiqueta<input data-wz-agenda-field="subtitle" value="${esc(m.subtitle || '')}" placeholder="Hoy, Mañana, Ahora en..."></label>
      <label>Empieza a salir<input type="datetime-local" data-wz-agenda-field="startAt" value="${esc(m.startAt || '')}"></label>
      <label>Deja de salir<input type="datetime-local" data-wz-agenda-field="endAt" value="${esc(m.endAt || '')}"></label>
      <label class="agenda-wide">Eventos que verá la pantalla<textarea data-wz-agenda-field="body" placeholder="21:00 | Concierto en la Virgen Blanca | Casco Viejo&#10;22:30 | DJ set | Plaza Nueva">${esc(m.body || '')}</textarea></label>
    </div>
  </div>`;
}

function renderAgendaWizard() {
  return `<div class="status"><b>Agenda viva:</b> crea tantos mensajes como necesites y decide cuándo empieza y cuándo desaparece cada uno.</div>
    <div class="agenda-wizard">${(WZ.agenda || []).map(agendaMomentHtml).join('')}</div>
    <button type="button" class="ghost agenda-add" data-wz-agenda-add>Añadir otro momento de agenda</button>`;
}

function orderedAgendaMoments(items) {
  return (items || [])
    .map((m) => ({ ...m }))
    .sort((a, b) => String(a.startAt || '').localeCompare(String(b.startAt || '')));
}

function normalizeAgendaMoments(items) {
  const out = orderedAgendaMoments(items);
  for (let i = 0; i < out.length; i++) {
    const cur = out[i];
    const next = out[i + 1];
    if (cur.startAt) {
      if (!cur.endAt) cur.endAt = next && next.startAt ? next.startAt : addMinutesLocal(cur.startAt, 60);
      if (next && next.startAt && cur.endAt > next.startAt) cur.endAt = next.startAt;
      if (cur.endAt && cur.endAt <= cur.startAt) cur.endAt = next && next.startAt && next.startAt > cur.startAt ? next.startAt : addMinutesLocal(cur.startAt, 60);
    }
  }
  return out;
}

function renderWizard() {
  const total = 3;
  $('#wzTitle').textContent = `Escaleta · paso ${WZ.step} de ${total}`;
  $('#wzBack').hidden = WZ.step === 1;
  $('#wzNext').textContent = WZ.step === 3 ? '✅ Guardar y ver vista previa' : 'Siguiente →';
  const chosen = PLAN_TYPES.filter((t) => WZ.sel.has(t.id));

  if (WZ.step === 1) {
    $('#wzBody').innerHTML = `
      <p class="hint" style="margin-top:0">Seleccione los tipos de cartela y los días a cubrir.</p>
      <label>Días a cubrir</label>
      <input id="wzDays" type="number" min="1" max="14" value="${WZ.days}">
      <label>Tipos de cartela</label>
      <div style="display:grid;gap:2px">${PLAN_TYPES.map((t) =>
        `<label class="chk"><input type="checkbox" data-wz-type="${t.id}" ${WZ.sel.has(t.id) ? 'checked' : ''}>${t.label}</label>`).join('')}</div>`;
    return;
  }

  if (WZ.step === 2) {
    const sections = chosen.map((t) => {
      const head = `<h3 style="margin:14px 0 4px;font-size:14px">${t.label}</h3>`;
      if (t.slot.source === 'worker' && t.slot.workerKey !== 'poolCapacity') {
        return head + `<div class="status">${esc(wzWorkerLine(t.slot.workerKey))}</div>`;
      }
      if (t.id === 'piscinas') {
        return head + `<label>Aforo actual (lo escribes tú)</label>
          <input data-wz-manual="piscinas:title" value="${esc((WZ.manual.piscinas || {}).title || '')}" placeholder="p. ej. 1.240">`;
      }
      if (t.id === 'agenda') {
        return head + renderAgendaWizard();
      }
      if (t.id === 'ultima') {
        return head + `<div class="status">Reservado y desactivado. Se activa desde el botón 🚨 del panel cuando haga falta.</div>`;
      }
      if (t.slot.source === 'library') {
        const key = t.slot.libraryKey;
        const items = (RUNDOWN.library && RUNDOWN.library[key]) || [];
        const preview = items.slice(0, 5).map((p) => `· ${esc(p.title || p.body || '')}`).join('<br>');
        return head + `<div class="status"><b>${items.length}</b> pieza(s) en el carrusel${items.length ? ':<br>' + preview + (items.length > 5 ? '<br>…' : '') : ''}</div>
          <label>Añadir piezas (una por línea: Título | firma | texto)</label>
          <textarea data-wz-add="${esc(key)}" placeholder="El casco medieval tiene forma de almendra | Dato curioso |">${esc(WZ.adds[key] || '')}</textarea>`;
      }
      return head + '<div class="status">Sin configuración adicional.</div>';
    }).join('');
    $('#wzBody').innerHTML = `<p class="hint" style="margin-top:0">Revise el contenido de cada tipo. Los datos automáticos no requieren edición.</p>` + sections;
    return;
  }

  // Paso 3: confirmación
  const newPieces = Object.values(WZ.adds).reduce((n, txt) => n + String(txt || '').split(/\r?\n/).filter((l) => l.trim()).length, 0);
  const agendaMoments = WZ.sel.has('agenda')
    ? (WZ.agenda || []).filter((m) => String(m.body || '').trim() || (String(m.title || '').trim() && String(m.title || '').trim() !== 'Agenda')).length
    : 0;
  $('#wzBody').innerHTML = `
    <p class="hint" style="margin-top:0">Resumen antes de confirmar:</p>
    <div class="status" style="line-height:1.7">
      Guion de <b>${chosen.length}</b> cartelas: ${chosen.map((t) => esc(t.slot.label)).join(' → ')}<br>
      Cobertura: <b>${WZ.days}</b> día(s); el carrusel cambia a diario sin repetir<br>
      ${agendaMoments ? `Agenda viva: <b>${agendaMoments}</b> mensaje(s) programado(s)<br>` : ''}
      ${newPieces ? `Se incorporan <b>${newPieces}</b> pieza(s) nuevas al carrusel<br>` : ''}
      Se generan las cartelas y se abre la vista previa del bucle<br>
      La publicación requiere confirmación manual o la publicación automática programada
    </div>`;
}

// Recoger lo tecleado antes de cambiar de paso
function wzCollect() {
  const d = $('#wzDays');
  if (d) WZ.days = Math.max(1, Math.min(14, Number(d.value) || 3));
  const agendaBoxes = [...$('#wzBody').querySelectorAll('[data-wz-agenda]')];
  if (agendaBoxes.length) {
    WZ.agenda = agendaBoxes.map((box) => {
      const obj = {};
      box.querySelectorAll('[data-wz-agenda-field]').forEach((el) => { obj[el.dataset.wzAgendaField] = el.value; });
      return obj;
    });
  }
  $('#wzBody').querySelectorAll('[data-wz-type]').forEach((el) => {
    if (el.checked) WZ.sel.add(el.dataset.wzType); else WZ.sel.delete(el.dataset.wzType);
  });
  $('#wzBody').querySelectorAll('[data-wz-manual]').forEach((el) => {
    const [id, field] = el.dataset.wzManual.split(':');
    WZ.manual[id] = WZ.manual[id] || {};
    WZ.manual[id][field] = el.value;
  });
  $('#wzBody').querySelectorAll('[data-wz-add]').forEach((el) => { WZ.adds[el.dataset.wzAdd] = el.value; });
}

async function wizardFinish() {
  const btn = $('#wzNext');
  btn.disabled = true;
  btn.textContent = '⏳ Guardando y creando cartelas…';
  try {
    const stamp = Date.now().toString(36);
    const chosen = PLAN_TYPES.filter((t) => WZ.sel.has(t.id));
    const slots = chosen.map((t) => {
      const s = { id: `plan_${t.id}_${stamp}`, enabled: t.enabled !== false, duration: t.duration || 8, video: false, theme: '', title: '', subtitle: '', body: '', date: '', template: '', libraryKey: '', workerKey: '', ...t.slot };
      return Object.assign(s, WZ.manual[t.id] || {});
    });
    const lib = RUNDOWN.library || {};
    if (WZ.sel.has('agenda')) {
      const meta = (RUNDOWN.libraryKeys || []).find((k) => k.key === 'agendaEventos') || { key: 'agendaEventos', template: 'agenda', theme: 'blanco' };
      lib.agendaEventos = normalizeAgendaMoments(WZ.agenda || [])
        .filter((m) => String(m.body || '').trim() || (String(m.title || '').trim() && String(m.title || '').trim() !== 'Agenda'))
        .map((m) => ({
          ...blankLibraryItem(meta),
          title: m.title || 'Agenda',
          subtitle: m.subtitle || '',
          body: m.body || '',
          startAt: m.startAt || '',
          endAt: m.endAt || '',
          start: m.start || '',
          end: m.end || '',
          dates: Array.isArray(m.dates) ? m.dates : [],
        }))
        .filter((item) => String(item.title || item.body || '').trim());
    }
    for (const [key, text] of Object.entries(WZ.adds)) {
      const meta = (RUNDOWN.libraryKeys || []).find((k) => k.key === key) || { key, template: 'noticia', theme: '' };
      const items = parseBulkItems(text || '', meta);
      if (items.length) { if (!Array.isArray(lib[key])) lib[key] = []; lib[key].push(...items); }
    }
    await api('/rundown', { method: 'PUT', body: JSON.stringify({ title: `Guion (${WZ.days} días)`, slots, days: {} }) });
    await api('/rundown/library', { method: 'PUT', body: JSON.stringify(lib) });
    await api('/workers/refresh', { method: 'POST' }).catch(() => {});
    await api('/rundown/materialize', { method: 'POST', body: JSON.stringify({}) });
    RD_PLAN_DAYS = WZ.days;
    wizardDlg.close();
    toast('Guion guardado y cartelas creadas · abriendo la vista previa');
    load();
    window.open('/review.html', '_blank');
  } catch (e) {
    toast('Error: ' + e.message);
  } finally {
    btn.disabled = false;
    if (WZ) renderWizard();
  }
}

function applyAgendaQuick(i, kind) {
  wzCollect();
  const m = (WZ.agenda || [])[i];
  if (!m) return;
  const today = agendaBaseDate();
  const tomorrow = addDays(today, 1);
  if (kind === 'now') m.startAt = localDateTimePart();
  if (kind === 'tonight') m.endAt = dateAtTime(today, '22:00');
  if (kind === 'tomorrow1320') {
    m.subtitle = m.subtitle || 'Mañana';
    m.startAt = dateAtTime(tomorrow, '13:20');
    m.endAt = '';
  }
  if (kind === 'tomorrow1342') {
    m.subtitle = m.subtitle || 'Mañana';
    m.startAt = dateAtTime(tomorrow, '13:42');
    m.endAt = '';
  }
  WZ.agenda = normalizeAgendaMoments(WZ.agenda);
  renderWizard();
}

$('#btnRundown').addEventListener('click', openWizard);
$('#wzClose').addEventListener('click', () => wizardDlg.close());
$('#wzAdvanced').addEventListener('click', () => { wizardDlg.close(); openRundown(); });
$('#wzBack').addEventListener('click', () => { wzCollect(); WZ.step = Math.max(1, WZ.step - 1); renderWizard(); });
$('#wzBody').addEventListener('click', (e) => {
  const quick = e.target.closest('[data-wz-agenda-quick]');
  if (quick) {
    applyAgendaQuick(Number(quick.dataset.i), quick.dataset.wzAgendaQuick);
    return;
  }
  const add = e.target.closest('[data-wz-agenda-add]');
  if (add) {
    wzCollect();
    WZ.agenda.push(blankAgendaMoment(WZ.agenda.length - 1));
    WZ.agenda = normalizeAgendaMoments(WZ.agenda);
    renderWizard();
    return;
  }
  const copy = e.target.closest('[data-wz-agenda-copy]');
  if (copy) {
    wzCollect();
    const i = Number(copy.dataset.wzAgendaCopy);
    const src = WZ.agenda[i];
    WZ.agenda.splice(i + 1, 0, { ...src, startAt: (src && (src.endAt || src.startAt)) || '', endAt: '', body: '' });
    WZ.agenda = normalizeAgendaMoments(WZ.agenda);
    renderWizard();
    return;
  }
  const del = e.target.closest('[data-wz-agenda-del]');
  if (del) {
    wzCollect();
    if (WZ.agenda.length > 1) WZ.agenda.splice(Number(del.dataset.wzAgendaDel), 1);
    renderWizard();
  }
});
$('#wzNext').addEventListener('click', () => {
  wzCollect();
  if (WZ.step === 1 && !WZ.sel.size) { toast('Marca al menos un tipo de cartela'); return; }
  if (WZ.step < 3) { WZ.step++; renderWizard(); return; }
  wizardFinish();
});

$('#btnWorkersRefresh').addEventListener('click', async (e) => {
  const b = e.target; b.disabled = true;
  toast('Actualizando datos automáticos…');
  try {
    await api('/workers/refresh', { method: 'POST' });
    // Recarga la escaleta para ver los datos reales en los bloques.
    const date = $('#rundownDate').value || localDatePart();
    if (RD_DIRTY) collectRundown(), collectLibraryCategory();
    const fresh = await api('/rundown?date=' + encodeURIComponent(date));
    if (!RD_DIRTY) { RUNDOWN = fresh; } else { RUNDOWN.report = fresh.report; RUNDOWN.dayTheme = fresh.dayTheme; }
    renderRundown();
    toast('Datos automáticos actualizados');
  } catch (err) { toast('Error: ' + err.message); }
  finally { b.disabled = false; }
});
$('#btnRundownClose').addEventListener('click', () => { if (confirmDiscard()) { rdSetDirty(false); rundownDlg.close(); } });
rundownDlg.addEventListener('cancel', (e) => { if (!confirmDiscard()) e.preventDefault(); else rdSetDirty(false); });
$('#btnRundownSave').addEventListener('click', () => saveAllRundown());
$('#btnRundownMake').addEventListener('click', makeRundown);
document.querySelectorAll('[data-rd-tab]').forEach((b) => b.addEventListener('click', () => {
  if (!RUNDOWN) return;
  collectRundown();
  collectLibraryCategory();
  setRundownTab(b.dataset.rdTab);
  if (b.dataset.rdTab === 'lib') renderLibraryPanel();
}));
$('#btnLibraryAdd').addEventListener('click', () => {
  if (!RUNDOWN) return;
  collectLibraryCategory();
  const meta = currentLibraryMeta();
  if (!Array.isArray(RUNDOWN.library[meta.key])) RUNDOWN.library[meta.key] = [];
  RUNDOWN.library[meta.key].push(meta.key === 'agendaEventos' ? blankAgendaLibraryItem() : blankLibraryItem(meta));
  LIB_OPEN = RUNDOWN.library[meta.key].length - 1;
  rdSetDirty(true);
  renderLibraryPanel();
  if (meta.key === 'agendaEventos') {
    toast('Bloque de agenda añadido: rellena eventos y guarda cambios');
    const open = $('#libraryList').querySelector(`[data-lib-item="${LIB_OPEN}"]`);
    if (open) open.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
});
$('#btnBulkImport').addEventListener('click', () => {
  if (!RUNDOWN) return;
  collectLibraryCategory();
  const meta = currentLibraryMeta();
  let items = [];
  try { items = parseBulkItems($('#bulkImport').value, meta); } catch { toast('Formato no válido'); return; }
  if (!items.length) { toast('No he encontrado piezas para importar'); return; }
  if (!Array.isArray(RUNDOWN.library[meta.key])) RUNDOWN.library[meta.key] = [];
  RUNDOWN.library[meta.key].push(...items);
  $('#bulkImport').value = '';
  rdSetDirty(true);
  renderLibraryPanel();
  toast(`Importadas ${items.length} pieza(s)`);
});
$('#btnRundownAdd').addEventListener('click', () => {
  if (!RUNDOWN) return;
  collectRundown();
  RUNDOWN.rundown.slots.push({
    id: 'manual_' + Date.now().toString(36),
    label: 'Nuevo bloque',
    enabled: true,
    source: 'fixed',
    template: 'noticia',
    theme: '',
    title: '',
    subtitle: '',
    body: '',
    duration: 8,
    video: false,
  });
  RUNDOWN_SELECTED = RUNDOWN.rundown.slots.length - 1;
  rdSetDirty(true);
  renderRundown();
});
$('#btnRundownReset').addEventListener('click', async () => {
  if (!confirm('¿Restaurar la escaleta inicial? Se pierden los cambios de la secuencia (el contenido programado se conserva).')) return;
  RUNDOWN = await api('/rundown/reset', { method: 'POST' });
  RUNDOWN_SELECTED = 0;
  LIB_OPEN = -1;
  rdSetDirty(false);
  renderRundown();
  toast('Escaleta restaurada');
});
$('#rundownDate').addEventListener('change', async () => {
  if (!RUNDOWN) return;
  if (RD_DIRTY) {
    if (confirm('Tienes cambios sin guardar. ¿Guardarlos antes de cambiar de día?')) {
      await saveAllRundown({ silent: true });
    }
  }
  RUNDOWN = await api('/rundown?date=' + encodeURIComponent($('#rundownDate').value));
  LIB_OPEN = -1;
  rdSetDirty(false);
  renderRundown();
});
// Storyboard: tocar una miniatura selecciona el bloque y abre su editor.
$('#slotList').addEventListener('click', (e) => {
  if (!RUNDOWN) return;
  const card = e.target.closest('[data-slot-open]');
  if (!card) return;
  collectRundown();
  const idx = Number(card.dataset.slotOpen);
  RUNDOWN_SELECTED = idx === RUNDOWN_SELECTED ? -1 : idx;
  renderRundown();
  const ed = $('#slotEditor');
  if (ed && !ed.hidden) ed.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
});
// Editor del bloque: mover, eliminar, cerrar, editar campos.
$('#slotEditor').addEventListener('click', (e) => {
  if (!RUNDOWN) return;
  const slots = RUNDOWN.rundown.slots || [];
  if (e.target.closest('[data-rd-close]')) {
    collectRundown();
    RUNDOWN_SELECTED = -1;
    renderRundown();
    return;
  }
  const del = e.target.closest('[data-rd-delete-current]');
  if (del) {
    if (!confirm('¿Eliminar este bloque del guion?')) return;
    slots.splice(RUNDOWN_SELECTED, 1);
    RUNDOWN_SELECTED = -1;
    rdSetDirty(true);
    renderRundown();
    return;
  }
  const mv = e.target.closest('[data-rd-move]');
  if (mv) {
    const i = RUNDOWN_SELECTED;
    const j = i + Number(mv.dataset.rdMove);
    if (i < 0 || j < 0 || j >= slots.length) return;
    collectRundown();
    [slots[i], slots[j]] = [slots[j], slots[i]];
    RUNDOWN_SELECTED = j;
    rdSetDirty(true);
    renderRundown();
    return;
  }
});
$('#slotEditor').addEventListener('input', () => { if (RUNDOWN) { collectRundown(); rdSetDirty(true); } });
$('#slotEditor').addEventListener('change', (e) => {
  if (!RUNDOWN) return;
  // Casillas de piezas del carrusel: activan/desactivan la pieza en su fondo.
  if (e.target && e.target.dataset && e.target.dataset.libEnable) {
    const [key, idx] = e.target.dataset.libEnable.split(':');
    const arr = RUNDOWN.library && RUNDOWN.library[key];
    if (arr && arr[Number(idx)]) arr[Number(idx)].enabled = e.target.checked;
  }
  collectRundown();
  rdSetDirty(true);
  renderRundown();
});
$('#rundownTitle').addEventListener('input', () => { if (RUNDOWN) rdSetDirty(true); });
$('#libraryCategory').addEventListener('change', () => {
  collectLibraryCategory();
  LIBRARY_CATEGORY = $('#libraryCategory').value;
  LIB_OPEN = -1;
  renderLibraryPanel();
});
$('#libraryPlanner').addEventListener('click', (e) => {
  const block = e.target.closest('[data-agenda-time-open]');
  if (!block || !RUNDOWN) return;
  collectLibraryCategory();
  LIB_OPEN = Number(block.dataset.agendaTimeOpen);
  renderLibraryPanel();
  const item = $('#libraryList').querySelector(`[data-lib-item="${LIB_OPEN}"]`);
  if (item) item.scrollIntoView({ behavior: 'smooth', block: 'center' });
});
$('#libraryList').addEventListener('input', () => { if (RUNDOWN) { collectLibraryCategory(); rdSetDirty(true); } });
$('#libraryList').addEventListener('change', (e) => {
  if (!RUNDOWN) return;
  // El selector "¿Cuándo sale?" muestra/oculta los campos de programación al momento.
  if (e.target && e.target.matches('[data-lib-mode]')) {
    const box = e.target.closest('.lib-edit').querySelector('.lib-sched');
    if (box) box.hidden = e.target.value !== 'scheduled';
  }
  collectLibraryCategory();
  rdSetDirty(true);
  renderLibraryPanel();
});
$('#libraryList').addEventListener('click', (e) => {
  if (!RUNDOWN) return;
  const quick = e.target.closest('[data-quick-time]');
  if (quick) {
    const wrap = quick.closest('.lib-edit');
    const active = RUNDOWN.activeDate || localDatePart();
    const tomorrow = addDays(active, 1);
    const now = new Date();
    const nowLocal = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}T${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const start = wrap.querySelector('[data-lib-field="startAt"]');
    const end = wrap.querySelector('[data-lib-field="endAt"]');
    if (quick.dataset.quickTime === 'now' && start) start.value = nowLocal;
    if (quick.dataset.quickTime === 'tonight' && end) end.value = dtLocal(active, '22:00');
    if (quick.dataset.quickTime === 'tomorrow1320') {
      if (start) start.value = dtLocal(tomorrow, '13:20');
      if (end && !end.value) end.value = dtLocal(tomorrow, '13:42');
    }
    if (quick.dataset.quickTime === 'tomorrow1342' && start) start.value = dtLocal(tomorrow, '13:42');
    collectLibraryCategory();
    rdSetDirty(true);
    renderLibraryPanel();
    return;
  }
  const del = e.target.closest('[data-lib-del]');
  if (del) {
    if (!confirm('¿Quitar esta pieza definitivamente?')) return;
    const meta = currentLibraryMeta();
    if (RUNDOWN.library[meta.key]) RUNDOWN.library[meta.key].splice(LIB_OPEN, 1);
    LIB_OPEN = -1;
    rdSetDirty(true);
    renderLibraryPanel();
    return;
  }
  const row = e.target.closest('[data-lib-open]');
  if (row) {
    collectLibraryCategory();
    const idx = Number(row.dataset.libOpen);
    LIB_OPEN = idx === LIB_OPEN ? -1 : idx;
    renderLibraryPanel();
  }
});

const publishDlg = $('#publishDlg');
let publishBusy = false;

function publishError(r) {
  if (!r || !r.steps) return 'No se pudo preparar la publicación';
  for (const k of ['generate', 'sequence', 'upload']) {
    if (r.steps[k] && r.steps[k].ok === false) return r.steps[k].error || `Falló ${k}`;
  }
  return 'Hubo errores, mira el log';
}

function plannedFiles(r) {
  const up = r && r.steps && r.steps.upload;
  const seq = r && r.steps && r.steps.sequence;
  if (up && Array.isArray(up.files)) return up.files;
  if (seq && Array.isArray(seq.files)) return seq.files;
  return [];
}

function setPublishBusy(on) {
  publishBusy = on;
  $('#btnPublish').disabled = on;
  $('#btnDry').disabled = on;
}

async function runPublish(dryRun) {
  setPublishBusy(true);
  toast(dryRun ? 'Probando…' : 'Publicando…');
  $('#dot').style.background = '#e0a106';
  try {
    const r = await api('/publish', { method: 'POST', body: JSON.stringify({ dryRun }) });
    $('#dot').style.background = r.ok ? '#2bb673' : '#e2231a';
    if (r.ok) {
      const files = plannedFiles(r);
      const up = r.steps.upload || {};
      if (dryRun) toast(`Prueba OK: ${files.length} archivo(s)`);
      else if (up.dryRun) toast(`Simulado: ${up.reason || 'no se subió al FTP'}`);
      else toast(`Publicado: ${(up.files || []).length} archivo(s)`);
    } else {
      toast(publishError(r));
    }
    loadStatus();
    return r;
  } catch (e) {
    $('#dot').style.background = '#e2231a';
    toast('Error: ' + e.message);
    return null;
  } finally {
    setPublishBusy(false);
  }
}

async function preparePublish() {
  if (publishBusy) return;
  if (!cards.some((c) => c.enabled !== false)) {
    toast('No hay cartelas activas');
    return;
  }
  const r = await runPublish(true);
  if (!r || !r.ok) return;

  const files = plannedFiles(r);
  const up = r.steps.upload || {};
  $('#publishPlan').innerHTML =
    `<p style="margin-top:0">La prueba está correcta. Se subirán <b>${files.length}</b> archivo(s) al FTP${up.remoteDir ? `, carpeta <b>${esc(up.remoteDir)}</b>` : ''}.</p>` +
    `<div id="publishFiles" style="font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px;background:#06101f;border:1px solid var(--line);border-radius:10px;padding:10px;max-height:34vh;overflow:auto;white-space:pre-wrap">${files.map(esc).join('\n')}</div>` +
    `<p class="hint" style="margin-bottom:0">Al confirmar se regenerará la secuencia y se intentará subir al FTP real.</p>`;
  publishDlg.showModal();
}

async function doPublish(dryRun) {
  return dryRun ? runPublish(true) : preparePublish();
}
$('#btnPublish').addEventListener('click', () => preparePublish());
$('#btnDry').addEventListener('click', () => doPublish(true));
$('#btnReview').addEventListener('click', () => window.open('/review.html', '_blank'));
$('#btnPublishCancel').addEventListener('click', () => publishDlg.close());
$('#btnPublishCancelTop').addEventListener('click', () => publishDlg.close());
$('#btnPublishConfirm').addEventListener('click', async () => {
  publishDlg.close();
  await runPublish(false);
});

// --- Estado / log ---
const statusDlg = $('#statusDlg');
$('#btnStatus').addEventListener('click', async () => { await loadStatus(true); statusDlg.showModal(); });

async function loadStatus(full) {
  try {
    const s = await api('/status');
    const st = s.status;
    const last = st.lastPublish ? new Date(st.lastPublish).toLocaleString('es-ES') : 'nunca';
    $('#statusLine').innerHTML =
      `Pantalla ${s.screen.width}×${s.screen.height} · FTP ${s.ftpConfigured ? '<b>configurado</b>' : '<b style="color:#e0a106">sin configurar</b>'} · Última publicación: <b>${last}</b>`;
    if (full) {
      $('#statusBox').innerHTML = Object.entries(st.stages || {}).map(([k, v]) =>
        `<div>${v.ok ? '✅' : '❌'} <b>${k}</b> · ${new Date(v.ts).toLocaleTimeString('es-ES')}${v.error ? ' · ' + esc(v.error) : ''}</div>`).join('') || 'Sin actividad aún.';
      const logs = await api('/log?n=120');
      $('#log').textContent = logs.map(l => `${(l.ts||'').slice(11,19)} ${(l.level||'').toUpperCase()} (${l.stage}) ${l.msg}`).join('\n');
    }
  } catch (e) { /* token? */ }
}

loadConfig().then(load);
loadPilot();
