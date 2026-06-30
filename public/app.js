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

// Galería visual de plantillas (probar varias con los datos actuales).
let galleryOpen = false;
let galleryToken = 0;
const tplCache = new Map(); // clave: template|datos -> objectURL

async function loadConfig() {
  try {
    const cfg = await api('/config');
    TEMPLATES = cfg.templates || [];
    PALETTE = cfg.palette || {};
    $('#edTemplate').innerHTML = TEMPLATES.map((t) => `<option value="${t.id}">${t.label}</option>`).join('');
    $('#edTheme').innerHTML = '<option value="">Auto (según plantilla)</option>' +
      Object.keys(PALETTE).map((k) => `<option value="${k}">${k}</option>`).join('');
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
  $('#setLogoMode').value = b.logoMode || 'image';
  $('#setLogoW').value = b.logoWidth || 14; $('#setLogoWVal').textContent = $('#setLogoW').value;
  $('#setScale').value = b.textScale || 1; $('#setScaleVal').textContent = (b.textScale || 1);
  const fams = SETTINGS.fonts || [];
  const opts = fams.map((f) => `<option value="'${f}', sans-serif">${f}</option>`).join('');
  $('#setFontDisplay').innerHTML = opts; $('#setFontText').innerHTML = opts;
  // marca la familia actual (primer nombre entre comillas)
  const cur = (s) => { const m = (s || '').match(/'([^']+)'/); return m ? m[1] : ''; };
  setSelectByFamily($('#setFontDisplay'), cur(b.fontDisplay));
  setSelectByFamily($('#setFontText'), cur(b.fontFamily));
  showLogoPrev('setLogoLightPrev', b.logoLight || b.logo);
  showLogoPrev('setLogoDarkPrev', b.logoDark);
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

$('#btnSetPreview').addEventListener('click', async () => {
  await api('/settings', { method: 'PUT', body: JSON.stringify(collectSettings()) });
  DV = Date.now();
  const r = await fetch('/api/preview', { method: 'POST', headers: H, body: JSON.stringify({ template: 'mensaje', title: 'Vitoria en verde.', theme: 'lima' }) });
  const img = $('#setPreview'); img.src = URL.createObjectURL(await r.blob()); img.style.display = 'block';
  toast('Aplicado');
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
  if (!cards.length) {
    el.innerHTML = '<div class="empty">No hay cartelas todavía.<br>Pulsa ＋ para crear la primera.</div>';
    return;
  }
  el.innerHTML = '';
  cards.forEach((c, i) => {
    const thumb = c.type === 'generated'
      ? `/api/preview/${c.id}?t=${c.updatedAt || ''}&v=${DV}`
      : (c.file ? '/media/' + c.file.replace('data/worker-inbox/', 'inbox/').replace('data/uploads/', 'uploads/') : '');
    const div = document.createElement('div');
    div.className = 'card';
    div.innerHTML = `
      <img class="thumb" src="${thumb}" alt="" onerror="this.style.opacity=.25">
      <div class="meta">
        <p class="t">${esc(c.title) || '(sin título)'}</p>
        <p class="s">${esc(c.subtitle) || ''}</p>
      </div>
      <div class="row">
        <span class="tag">${c.type}</span>
        ${c.source === 'worker' ? '<span class="tag worker">worker</span>' : ''}
        ${c.enabled === false ? '<span class="tag off">oculta</span>' : ''}
        <span class="tag">${c.duration||10}s</span>
        <span class="spacer"></span>
        <button class="iconbtn" data-up="${i}" ${i===0?'disabled':''}>▲</button>
        <button class="iconbtn" data-down="${i}" ${i===cards.length-1?'disabled':''}>▼</button>
        <button class="iconbtn" data-edit="${c.id}">✎</button>
        ${c.type === 'generated' ? `<button class="iconbtn" data-design="${c.id}" title="Editor de diseño">🎨</button>` : ''}
        <button class="iconbtn" data-del="${c.id}">🗑</button>
      </div>`;
    el.appendChild(div);
  });
}

function esc(s){return (s||'').replace(/[&<>]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[m]));}

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
  $('#edVideoIntro').value = card?.videoIntro || '';
  $('#edVideoOutro').value = card?.videoOutro || '';
  $('#edPreview').style.display = 'none';
  $('#edUrl').value = '';
  $('#urlHint').textContent = 'Pega el enlace y rellenamos los campos. Luego edítalos a tu gusto.';
  // Cierra la galería de plantillas al (re)abrir el editor.
  galleryOpen = false; galleryToken++;
  $('#tplGallery').innerHTML = '';
  $('#btnGallery').textContent = '🖼 Probar plantillas visualmente';
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
  const r = await fetch('/api/preview', { method: 'POST', headers: H, body: JSON.stringify(data) });
  const blob = await r.blob();
  const img = $('#edPreview');
  img.src = URL.createObjectURL(blob); img.style.display = 'block';
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
$('#list').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.up != null) move(+b.dataset.up, -1);
  else if (b.dataset.down != null) move(+b.dataset.down, +1);
  else if (b.dataset.edit) openEditor(cards.find(c => c.id === b.dataset.edit));
  else if (b.dataset.design) location.href = '/editor.html?id=' + b.dataset.design;
  else if (b.dataset.del) {
    if (confirm('¿Eliminar esta cartela?'))
      api('/cards/' + b.dataset.del, { method: 'DELETE' }).then(() => { toast('Eliminada'); load(); });
  }
});

// --- Barra de acciones ---
$('#btnAdd').addEventListener('click', () => openEditor(null));
$('#btnRefresh').addEventListener('click', load);
$('#btnImport').addEventListener('click', async () => {
  const r = await api('/import', { method: 'POST' });
  toast(`Worker: ${r.added.length} nuevo(s) de ${r.scanned}`); load();
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
