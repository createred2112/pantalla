'use strict';

const H = { 'Content-Type': 'application/json' };
const $ = (s) => document.querySelector(s);

async function api(path, opts = {}) {
  const r = await fetch('/api' + path, { headers: H, ...opts });
  if (r.status === 401) { location.href = '/login'; throw new Error('sesión expirada'); }
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || r.status);
  return r.json();
}

function esc(s) {
  return String(s || '').replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
}

function mediaPath(file) {
  const f = String(file || '');
  if (f.startsWith('data/uploads/')) return '/media/' + f.replace('data/uploads/', 'uploads/');
  if (f.startsWith('data/worker-inbox/')) return '/media/' + f.replace('data/worker-inbox/', 'inbox/');
  return null;
}

function previewUrl(card, stamp) {
  const id = encodeURIComponent(card.id);
  if (card.type === 'generated' && card.video) return `/media/output/${id}.mp4?v=${stamp}`;
  if (card.type === 'generated') return `/api/preview/${id}?v=${stamp}`;
  return mediaPath(card.file) || `/api/preview/${id}?v=${stamp}`;
}

function isVideo(card, item) {
  return card.type === 'video' || (card.type === 'generated' && card.video) || /\.mp4$/i.test(item.file || card.file || '');
}

function render(items, cardsById) {
  const stamp = Date.now();
  if (!items.length) {
    $('#content').innerHTML = '<div class="empty">No hay cartelas activas para revisar.</div>';
    return;
  }
  $('#content').innerHTML = `<div class="grid">${items.map((item) => {
    const card = cardsById.get(item.id) || {};
    const title = card.title || item.id || '(sin titulo)';
    const src = previewUrl(card, stamp);
    const media = isVideo(card, item)
      ? `<video class="media" src="${esc(src)}" controls muted playsinline preload="metadata"></video>`
      : `<img class="media" src="${esc(src)}" alt="">`;
    return `<article class="card">
      ${media}
      <div class="meta">
        <div class="top"><span class="num">${item.order}</span><div class="title">${esc(title)}</div></div>
        <div class="file">${esc(item.file)}</div>
        <div class="tags">
          <span class="tag">${esc(card.type || item.type)}</span>
          <span class="tag">${Number(item.duration || card.duration || 10)}s</span>
          ${card.video ? '<span class="tag">MP4 animado</span>' : ''}
        </div>
      </div>
    </article>`;
  }).join('')}</div>`;
}

function publishError(r) {
  for (const k of ['generate', 'sequence', 'upload']) {
    if (r && r.steps && r.steps[k] && r.steps[k].ok === false) return r.steps[k].error || `Fallo en ${k}`;
  }
  return 'No se pudo preparar la vista previa.';
}

async function load() {
  $('#btnReload').disabled = true;
  $('#status').textContent = 'Regenerando cartelas en modo prueba...';
  $('#content').innerHTML = '';
  try {
    const result = await api('/publish', { method: 'POST', body: JSON.stringify({ dryRun: true }) });
    if (!result.ok) throw new Error(publishError(result));
    const cards = await api('/cards');
    const manifest = (result.steps.sequence && result.steps.sequence.manifest) || [];
    const map = new Map(cards.map((c) => [c.id, c]));
    render(manifest, map);
    const files = manifest.length + 1;
    $('#status').innerHTML = `Prueba lista: <b>${manifest.length}</b> cartela(s). Si publicas ahora, se subirían <b>${files}</b> archivo(s), incluyendo <b>playlist.json</b>.`;
  } catch (e) {
    $('#content').innerHTML = `<div class="error">${esc(e.message)}</div>`;
    $('#status').textContent = 'No se pudo preparar la vista previa.';
  } finally {
    $('#btnReload').disabled = false;
  }
}

$('#btnReload').addEventListener('click', load);
load();
