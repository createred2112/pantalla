'use strict';
// Panel de admin de LA PANTALLA. Vanilla JS, móvil-first.

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
  return {
    brand: b,
    palette,
    screen: {
      ...(SETTINGS.screen || {}),
      width: Number($('#setScreenW').value) || 1920,
      height: Number($('#setScreenH').value) || 1080,
      format: $('#setScreenFormat').value || 'jpg',
    },
    screenProfile: {
      name: $('#setProfileName').value.trim() || 'Pantalla principal',
      acceptImage: $('#setAcceptImage').checked,
      acceptVideo: $('#setAcceptVideo').checked,
      includePlaylist: $('#setIncludePlaylist').checked,
      notes: $('#setProfileNotes').value.trim(),
    },
    naming: {
      pattern: $('#setNamePattern').value.trim() || '{nn}_{slug}',
      padStart: Number($('#setPadStart').value) || 2,
      separator: $('#setSeparator').value || '_',
      lowercase: $('#setLowercase').checked,
      prefixWithOrder: true,
    },
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
        ${c.type === 'generated' && c.template !== 'luz' && c.template !== 'gasolina' ? `<button class="iconbtn" data-design="${c.id}" title="Editor de diseño">🎨</button>` : ''}
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
function openEditor(card) {
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
  const data = collect();
  try {
    if (id) await api('/cards/' + id, { method: 'PUT', body: JSON.stringify(data) });
    else await api('/cards', { method: 'POST', body: JSON.stringify(data) });
    editor.close(); toast('Guardado'); load();
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
  if (last.ok === false) return `última: ${when} · ⚠ falló (mira Estado)`;
  return `última: ${when} · ${last.cards || 0} cartelas${last.published ? ' publicadas ✓' : ''}`;
}

function renderPilot() {
  if (!PILOT) return;
  const bar = $('#pilotBar');
  bar.style.display = 'flex';
  bar.classList.toggle('on', PILOT.enabled);
  $('#pilotIco').textContent = PILOT.enabled ? '🛫' : '🛬';
  $('#pilotTitle').textContent = PILOT.enabled ? 'Piloto automático · ACTIVO' : 'Piloto automático · apagado';
  const workersTxt = (PILOT.workers || []).filter((w) => w.fresh).map((w) => w.preview).filter(Boolean).join(' · ');
  $('#pilotInfo').textContent = PILOT.enabled
    ? `Escaleta y publicación solas cada día a las ${PILOT.time} · ${fmtLastRun(PILOT.last)}${workersTxt ? ' · Datos: ' + workersTxt : ''}`
    : `Actívalo y la pantalla se actualizará sola cada mañana, sin tocar nada${workersTxt ? ' · Datos listos: ' + workersTxt : ''}`;
  $('#pilotTime').value = PILOT.time || '08:00';
  $('#pilotToggle').textContent = PILOT.enabled ? 'Apagar' : 'Activar';
  $('#pilotToggle').classList.toggle('primary', !PILOT.enabled);
}

async function loadPilot() {
  try { PILOT = await api('/autopilot'); renderPilot(); } catch {}
}

async function savePilot(patch) {
  PILOT = await api('/autopilot', { method: 'PUT', body: JSON.stringify({ enabled: PILOT.enabled, time: $('#pilotTime').value || '08:00', publish: true, ...patch }) });
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
  toast('Hora del piloto: ' + PILOT.time);
});
$('#pilotRun').addEventListener('click', async (e) => {
  const b = e.target;
  b.disabled = true;
  b.textContent = '⏳ Preparando…';
  try {
    // Prepara el día (datos + escaleta + render) SIN publicar: se revisa abajo
    // y se publica con el botón de siempre, que enseña el plan antes de subir.
    const r = await api('/autopilot/run', { method: 'POST', body: JSON.stringify({ publish: false }) });
    toast(`Escaleta de hoy lista: ${r.cards} cartela(s). Revisa abajo y pulsa Publicar.`);
    load();
    loadPilot();
  } catch (err) {
    toast('Error: ' + err.message);
  } finally {
    b.disabled = false;
    b.textContent = '⚡ Preparar hoy';
  }
});

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
    toast('🚨 ÚLTIMA HORA en primera posición. Revisa el plan y confirma.');
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
  { id: 'tiempo', label: '🌤 Tiempo de hoy (automático)', def: true, slot: { source: 'worker', workerKey: 'weather', template: 'clima', label: 'Tiempo' } },
  { id: 'prevision', label: '📆 Previsión 3 días (automático)', def: true, slot: { source: 'worker', workerKey: 'forecast', template: 'prevision', label: 'Previsión' } },
  { id: 'agenda', label: '🗓 Agenda (la escribes tú)', def: true, duration: 10, slot: { source: 'fixed', template: 'agenda', label: 'Agenda', title: 'Agenda', body: '19:30 | Escribe aquí el plan | Lugar' } },
  { id: 'curioso', label: '💡 Dato curioso (rota del almacén)', def: true, slot: { source: 'library', libraryKey: 'datosCuriosos', label: 'Dato curioso' } },
  { id: 'utiles', label: 'ℹ️ Aviso útil (rota del almacén)', slot: { source: 'library', libraryKey: 'datosUtiles', label: 'Aviso útil' } },
  { id: 'consejo', label: '💻 Consejo · Fast2Computer (rota)', slot: { source: 'library', libraryKey: 'consejosInformaticos', label: 'Consejo informático' } },
  { id: 'luz', label: '💶 Precio de la luz (automático)', slot: { source: 'worker', workerKey: 'powerPrice', label: 'Precio de la luz' } },
  { id: 'gasolina', label: '⛽ Gasolineras más baratas (automático)', slot: { source: 'worker', workerKey: 'fuel', label: 'Gasolina más barata' } },
  { id: 'aire', label: '🍃 Calidad del aire (automático)', slot: { source: 'worker', workerKey: 'airQuality', template: 'dato', label: 'Calidad del aire' } },
  { id: 'piscinas', label: '🏊 Aforo piscinas (lo escribes tú)', slot: { source: 'worker', workerKey: 'poolCapacity', template: 'dato', label: 'Aforo piscinas', subtitle: 'Personas en las piscinas' } },
  { id: 'ultima', label: '🚨 Hueco de última hora (apagado hasta que haga falta)', enabled: false, slot: { source: 'fixed', template: 'alerta', label: 'Última hora', subtitle: 'ÚLTIMA HORA' } },
];

function rdSetDirty(v) {
  RD_DIRTY = v;
  $('#btnRundownSave').textContent = v ? '💾 Guardar cambios ●' : '💾 Guardar cambios';
}

function setRundownTab(tab) {
  $('#rdTabSeq').hidden = tab !== 'seq';
  $('#rdTabLib').hidden = tab !== 'lib';
  document.querySelectorAll('[data-rd-tab]').forEach((b) => b.classList.toggle('sel', b.dataset.rdTab === tab));
}

async function openRundown() {
  const today = new Date().toISOString().slice(0, 10);
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
  $('#rundownDate').value = RUNDOWN.activeDate || new Date().toISOString().slice(0, 10);
  const rep = RUNDOWN.report || [];
  const emits = (s, i) => s.enabled !== false && !(rep[i] && rep[i].skippedToday);
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
  const srcTitle = s.source === 'library' ? `Rota: cada día una pieza de «${libLabel(s.libraryKey)}»`
    : (s.source === 'worker' ? 'Automático: se rellena solo con datos reales' : 'Escrito por ti');
  const say = rep.skippedToday ? 'no se emite este día'
    : (rep.missing ? (rep.note || 'sin contenido todavía') : (rep.title || s.title || '—'));
  const sel = i === RUNDOWN_SELECTED;
  return `<button type="button" class="sb-card ${sel ? 'sel' : ''} ${s.enabled === false || rep.skippedToday ? 'off' : ''} ${rep.missing ? 'missing' : ''}" data-slot-open="${i}" title="${esc(srcTitle)}">
    <div class="sb-thumb">${srcIco}
      <img src="/media/output/rd_${encodeURIComponent(s.id)}.jpg?v=${RD_STAMP}" alt="" loading="lazy" onerror="this.remove()">
      <span class="sb-num">${String(i + 1).padStart(2, '0')}</span>
      <span class="sb-dur">${Number(s.duration) || 8}s${s.video ? ' ▶' : ''}</span>
    </div>
    <div class="sb-meta">
      <div class="sb-name">${srcIco} ${esc(s.label)}${s.enabled === false ? ' · APAGADO' : (rep.skippedToday ? ' · HOY NO' : '')}</div>
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
      <b>✏️ ${esc(s.label)} — bloque ${String(RUNDOWN_SELECTED + 1).padStart(2, '0')}</b>
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
      <label>¿De dónde sale el contenido?<select data-rd-current="source">
        <option value="fixed" ${s.source === 'fixed' ? 'selected' : ''}>✍️ Lo escribo yo aquí</option>
        <option value="library" ${isLib ? 'selected' : ''}>🔁 Rota: cada día una pieza distinta</option>
        <option value="worker" ${isWorker ? 'selected' : ''}>⚙️ Automático: se rellena solo</option>
      </select></label>
      ${isLib ? `<label>Tipo de pieza (del almacén)<select data-rd-current="libraryKey">
        ${keys.map((k) => `<option value="${esc(k.key)}" ${k.key === s.libraryKey ? 'selected' : ''}>${esc(k.label)}</option>`).join('')}
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
        ? `<div class="slot-wide hint" style="align-self:center">Cada día este bloque enseña una pieza distinta de ese tipo. Las piezas se crean y programan en la pestaña «🔁 Piezas que rotan».</div>`
        : (isWorker
          ? `<div class="slot-wide hint" style="align-self:center">No hay nada que escribir: el dato llega solo (se refresca cada 30 min y antes de publicar) y elige su propia plantilla. «⚙️ Actualizar datos reales» lo trae ahora mismo.</div>`
          : `<label>Título<input data-rd-current="title" value="${esc(s.title || '')}"></label>
      <label>Subtítulo<input data-rd-current="subtitle" value="${esc(s.subtitle || '')}"></label>
      <label class="slot-wide">Texto<textarea data-rd-current="body">${esc(s.body || '')}</textarea></label>`)}
      <label>Duración (segundos)<input type="number" min="1" data-rd-current="duration" value="${Number(s.duration) || 8}"></label>
      <label><input type="checkbox" data-rd-toggle="enabled" ${s.enabled !== false ? 'checked' : ''} style="width:auto;margin-right:8px"> Activa (todos los días)</label>
      <label><input type="checkbox" data-rd-toggle="video" ${s.video ? 'checked' : ''} style="width:auto;margin-right:8px"> Animada (MP4)</label>
      <label class="slot-wide" style="color:#ffd98a"><input type="checkbox" data-rd-skipday ${((((RUNDOWN.rundown || {}).days || {})[RUNDOWN.activeDate] || {}).skip || []).includes(s.id) ? 'checked' : ''} style="width:auto;margin-right:8px">
        No emitir SOLO el ${esc(RUNDOWN.activeDate || 'día elegido')} (el resto de días sale con normalidad)</label>
    </div>
    <div class="status">${rep.missing
      ? '⚠️ ' + esc(rep.note || 'Pendiente de contenido')
      : `✅ El ${esc(RUNDOWN.activeDate || 'día elegido')} saldrá: <b>${esc(rep.title || s.title || s.label)}</b>`}</div>
    <div class="slot-tools">
      <button class="ghost" data-rd-move="-1" ${i === 0 ? 'disabled' : ''}>← Emitir antes</button>
      <button class="ghost" data-rd-move="1" ${i === slots.length - 1 ? 'disabled' : ''}>Emitir después →</button>
      <span class="spacer"></span>
      <button class="ghost" data-rd-delete-current>🗑 Eliminar bloque</button>
    </div>`;
}

function currentLibraryMeta() {
  const keys = RUNDOWN.libraryKeys || [];
  return keys.find((x) => x.key === LIBRARY_CATEGORY) || keys[0] || { key: LIBRARY_CATEGORY, label: 'Contenido', template: 'noticia', theme: '' };
}

function blankLibraryItem(meta) {
  return { title: '', subtitle: '', body: '', template: meta.template || 'noticia', theme: meta.theme || '', enabled: true, start: '', end: '', dates: [], weekdays: [] };
}

function clientDayNumber(date) {
  const jsDay = new Date(`${date}T12:00:00`).getDay();
  return jsDay === 0 ? 7 : jsDay;
}

function clientItemApplies(item, date) {
  if (item.enabled === false) return false;
  const d = date || new Date().toISOString().slice(0, 10);
  const dates = Array.isArray(item.dates) ? item.dates : [];
  const weekdays = Array.isArray(item.weekdays) ? item.weekdays.map(Number) : [];
  if (dates.length) return dates.includes(d);
  if (item.start && d < item.start) return false;
  if (item.end && d > item.end) return false;
  if (weekdays.length && !weekdays.includes(clientDayNumber(d))) return false;
  return true;
}

// ¿La pieza tiene alguna programación de fechas?
function isScheduled(item) {
  return Boolean((item.dates && item.dates.length) || (item.weekdays && item.weekdays.length) || item.start || item.end);
}

const WEEKDAY_SHORT = ['', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];

function fmtShortDate(d) {
  try { return new Date(d + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }); }
  catch { return d; }
}

// Resumen legible de cuándo sale una pieza: "siempre", "1 jul – 31 ago · lun mié", "solo 15 jul"...
function scheduleSummary(item) {
  if (item.enabled === false) return 'desactivada';
  if (item.dates && item.dates.length) return 'solo ' + item.dates.map(fmtShortDate).join(', ');
  const parts = [];
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
  return dt.toISOString().slice(0, 10);
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
  const exact = pool.filter((it) => it.enabled !== false && Array.isArray(it.dates) && it.dates.includes(date));
  const scheduled = exact.length ? exact : pool.filter((it) => clientItemApplies(it, date));
  return [...daily, ...scheduled];
}

// Planificador: qué pieza saldrá en cada bloque programado los próximos 7 días.
function renderPlanner() {
  const box = $('#libraryPlanner');
  if (!box || !RUNDOWN) return;
  const slots = ((RUNDOWN.rundown || {}).slots || []).filter((s) => s.enabled !== false && s.source === 'library');
  if (!slots.length) { box.innerHTML = ''; return; }
  const start = RUNDOWN.activeDate || new Date().toISOString().slice(0, 10);
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

function renderLibraryPanel() {
  const keys = RUNDOWN.libraryKeys || [];
  if (!keys.some((x) => x.key === LIBRARY_CATEGORY) && keys[0]) LIBRARY_CATEGORY = keys[0].key;
  $('#libraryCategory').innerHTML = keys.map((meta) => `<option value="${esc(meta.key)}" ${meta.key === LIBRARY_CATEGORY ? 'selected' : ''}>${esc(meta.label)}</option>`).join('');
  const meta = currentLibraryMeta();
  const items = (RUNDOWN.library && Array.isArray(RUNDOWN.library[meta.key])) ? RUNDOWN.library[meta.key] : [];
  const activeDate = RUNDOWN.activeDate || new Date().toISOString().slice(0, 10);
  const eligible = items.filter((item) => clientItemApplies(item, activeDate)).length;
  $('#librarySummary').innerHTML =
    `<b>${items.length}</b> pieza(s) en esta categoría · <b style="color:${eligible ? '#bff0d5' : '#ffd98a'}">${eligible}</b> pueden salir el ${esc(fmtShortDate(activeDate))}`;
  renderPlanner();
  $('#libraryList').innerHTML = items.length ? items.map((item, i) => libraryItemHtml(meta, item, i)).join('') :
    '<div class="empty">Esta categoría está vacía. Añade una pieza o importa un lote.</div>';
}

function weekdayBox(item, n, label) {
  const on = Array.isArray(item.weekdays) && item.weekdays.map(Number).includes(n);
  return `<label><input type="checkbox" data-lib-weekday="${n}" ${on ? 'checked' : ''}>${label}</label>`;
}

function libraryItemHtml(meta, item, i) {
  const head = `<button type="button" class="lib-row" data-lib-open="${i}">
      <span class="lib-dot ${item.enabled !== false ? 'on' : ''}"></span>
      <span class="lib-title">${esc(item.title || item.body || '(sin título)')}</span>
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
        <label>Título<input data-lib-field="title" value="${esc(item.title || '')}"></label>
        <label>Firma/sección<input data-lib-field="subtitle" value="${esc(item.subtitle || '')}"></label>
      </div>
      <label>Texto<textarea data-lib-field="body">${esc(item.body || '')}</textarea></label>
      <label>¿Cuándo sale?
        <select data-lib-mode>
          <option value="always" ${!sched ? 'selected' : ''}>Siempre (rota con las demás piezas)</option>
          <option value="scheduled" ${sched ? 'selected' : ''}>Solo cuando lo programe</option>
        </select>
      </label>
      <div class="lib-sched" ${sched ? '' : 'hidden'}>
        <div class="mini">
          <label>Desde<input type="date" data-lib-field="start" value="${esc(item.start || '')}"></label>
          <label>Hasta<input type="date" data-lib-field="end" value="${esc(item.end || '')}"></label>
        </div>
        <label>Días de la semana (vacío = todos)</label>
        <div class="weekdays">${weekdayBox(item, 1, 'L')}${weekdayBox(item, 2, 'M')}${weekdayBox(item, 3, 'X')}${weekdayBox(item, 4, 'J')}${weekdayBox(item, 5, 'V')}${weekdayBox(item, 6, 'S')}${weekdayBox(item, 7, 'D')}</div>
        <label>Solo fechas concretas<input data-lib-field="dates" value="${esc((item.dates || []).join(', '))}" placeholder="2026-07-15, 2026-08-04"></label>
        <div class="hint">Si pones fechas concretas, la pieza sale SOLO esos días y desplaza a las piezas de rotación normal.</div>
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
        <button type="button" class="ghost" data-lib-del>🗑 Quitar pieza</button>
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
      const d = RUNDOWN.activeDate || new Date().toISOString().slice(0, 10);
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
  if (mode && mode.value === 'always') { obj.start = ''; obj.end = ''; obj.dates = []; obj.weekdays = []; }
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
    };
  }).filter((item) => item.title || item.body);
}

// Guarda TODO de una vez: secuencia + contenido programado.
async function saveAllRundown(opts = {}) {
  const date = $('#rundownDate').value || new Date().toISOString().slice(0, 10);
  collectRundown();
  collectLibraryCategory();
  const rd = RUNDOWN.rundown;
  const lib = RUNDOWN.library;
  await api('/rundown?date=' + encodeURIComponent(date), { method: 'PUT', body: JSON.stringify(rd) });
  RUNDOWN = await api('/rundown/library?date=' + encodeURIComponent(date), { method: 'PUT', body: JSON.stringify(lib) });
  rdSetDirty(false);
  renderRundown();
  if (!opts.silent) toast('Escaleta y contenido guardados');
}

async function makeRundown() {
  const btn = $('#btnRundownMake');
  btn.disabled = true;
  try {
    await saveAllRundown({ silent: true });
    const date = $('#rundownDate').value || new Date().toISOString().slice(0, 10);
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

$('#btnRundown').addEventListener('click', openRundown);
// --- 🪄 Asistente Planificar días: días + tipos → guion generado ---
const planDlg = $('#planDlg');
$('#btnPlanWizard').addEventListener('click', () => {
  if (!RUNDOWN) return;
  $('#planTypes').innerHTML = PLAN_TYPES.map((t, i) =>
    `<label class="chk"><input type="checkbox" data-plan="${i}" ${t.def ? 'checked' : ''}>${t.label}</label>`).join('');
  planDlg.showModal();
});
$('#planGo').addEventListener('click', () => {
  if (!RUNDOWN) return;
  const sel = [...$('#planTypes').querySelectorAll('[data-plan]:checked')].map((el) => PLAN_TYPES[Number(el.dataset.plan)]);
  if (!sel.length) { toast('Elige al menos un tipo de cartela'); return; }
  RD_PLAN_DAYS = Math.max(1, Math.min(14, Number($('#planDays').value) || 3));
  const stamp = Date.now().toString(36);
  const newSlots = sel.map((t) => ({
    id: `plan_${t.id}_${stamp}`, enabled: t.enabled !== false, duration: t.duration || 8, video: false,
    theme: '', title: '', subtitle: '', body: '', date: '', template: '', libraryKey: '', workerKey: '',
    ...t.slot,
  }));
  collectRundown();
  RUNDOWN.rundown.slots = $('#planReplace').checked ? newSlots : [...(RUNDOWN.rundown.slots || []), ...newSlots];
  RUNDOWN_SELECTED = -1;
  rdSetDirty(true);
  planDlg.close();
  renderRundown();
  toast(`Guion generado: ${sel.length} tipos · ${RD_PLAN_DAYS} día(s). Revisa, 💾 Guarda y «Crear las cartelas».`);
});
$('#btnWorkersRefresh').addEventListener('click', async (e) => {
  const b = e.target; b.disabled = true;
  toast('Actualizando datos automáticos…');
  try {
    await api('/workers/refresh', { method: 'POST' });
    // Recarga la escaleta para ver los datos reales en los bloques.
    const date = $('#rundownDate').value || new Date().toISOString().slice(0, 10);
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
  RUNDOWN.library[meta.key].push(blankLibraryItem(meta));
  LIB_OPEN = RUNDOWN.library[meta.key].length - 1;
  rdSetDirty(true);
  renderLibraryPanel();
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
$('#slotEditor').addEventListener('change', () => { if (RUNDOWN) { collectRundown(); rdSetDirty(true); renderRundown(); } });
$('#rundownTitle').addEventListener('input', () => { if (RUNDOWN) rdSetDirty(true); });
$('#libraryCategory').addEventListener('change', () => {
  collectLibraryCategory();
  LIBRARY_CATEGORY = $('#libraryCategory').value;
  LIB_OPEN = -1;
  renderLibraryPanel();
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
  if (seq && Array.isArray(seq.files)) return [...seq.files, 'playlist.json'];
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
