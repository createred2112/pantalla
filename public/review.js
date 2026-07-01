'use strict';

const H = { 'Content-Type': 'application/json' };
const $ = (s) => document.querySelector(s);

let slides = [];
let index = 0;
let playing = true;
let slideTimer = null;
let progressTimer = null;
let pollTimer = null;
let loadStarted = 0;

const stepNames = [
  ['import', 'Importar', 'Revisando worker'],
  ['generate', 'Generar', 'Creando JPG/MP4'],
  ['sequence', 'Ordenar', 'Nombres finales'],
  ['upload', 'FTP', 'Simulación sin subir'],
];

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

function extOf(file, fallback) {
  const m = String(file || '').match(/\.([a-z0-9]+)$/i);
  return (m && m[1].toLowerCase()) || fallback;
}

function outputUrl(card, item, stamp) {
  const id = encodeURIComponent(card.id || item.id);
  const type = card.type || item.type;
  if (type === 'generated') return `/media/output/${id}.${extOf(item.file, card.video ? 'mp4' : 'jpg')}?v=${stamp}`;
  return mediaPath(card.file) || `/api/preview/${id}?v=${stamp}`;
}

function isVideo(card, item) {
  const type = card.type || item.type;
  return type === 'video' || (type === 'generated' && card.video) || /\.mp4$/i.test(item.file || card.file || '');
}

function renderSteps(activeStage) {
  $('#steps').innerHTML = stepNames.map(([key, label, text]) => {
    const pos = stepNames.findIndex((s) => s[0] === key);
    const activePos = stepNames.findIndex((s) => s[0] === activeStage);
    const cls = activeStage && pos < activePos ? ' ok' : (key === activeStage ? ' on' : '');
    return `<div class="step${cls}"><b>${label}</b>${text}</div>`;
  }).join('');
}

function latestStage(logs) {
  for (let i = logs.length - 1; i >= 0; i--) {
    if (stepNames.some(([key]) => key === logs[i].stage)) return logs[i].stage;
  }
  return 'import';
}

async function pollProgress() {
  try {
    const logs = (await api('/log?n=80'))
      .filter((l) => l.ts && new Date(l.ts).getTime() >= loadStarted)
      .filter((l) => ['import', 'generate', 'sequence', 'upload', 'publish'].includes(l.stage));
    renderSteps(latestStage(logs));
    const lines = logs.slice(-10).map((l) => {
      const t = new Date(l.ts).toLocaleTimeString('es-ES');
      return `${t}  ${String(l.stage || '').padEnd(8)}  ${l.msg || ''}`;
    });
    $('#liveLog').textContent = lines.length ? lines.join('\n') : 'Preparando el trabajo...';
    $('#liveLog').scrollTop = $('#liveLog').scrollHeight;
  } catch {}
}

function startProgress() {
  clearInterval(pollTimer);
  renderSteps('import');
  pollProgress();
  pollTimer = setInterval(() => {
    const seconds = Math.floor((Date.now() - loadStarted) / 1000);
    $('#status').innerHTML = `Preparando simulación de pantalla... <b>${seconds}s</b>`;
    pollProgress();
  }, 1200);
}

function stopProgress() {
  clearInterval(pollTimer);
  pollTimer = null;
}

function clearPlayback() {
  clearTimeout(slideTimer);
  clearInterval(progressTimer);
  slideTimer = null;
  progressTimer = null;
}

function currentMedia() {
  return $('#screenMedia').querySelector('video,img');
}

function updateProgress(start, durationMs, media) {
  clearInterval(progressTimer);
  $('#timer').value = 0;
  progressTimer = setInterval(() => {
    let value = (Date.now() - start) / durationMs;
    if (media && media.tagName === 'VIDEO' && media.duration) value = media.currentTime / media.duration;
    $('#timer').value = Math.max(0, Math.min(1, value));
  }, 120);
}

function nextSlide() {
  if (!slides.length) return;
  showSlide((index + 1) % slides.length);
}

function prevSlide() {
  if (!slides.length) return;
  showSlide((index - 1 + slides.length) % slides.length);
}

function schedule(slide, media) {
  clearPlayback();
  if (!playing) return;
  const durationMs = Math.max(1, Number(slide.duration || 10)) * 1000;
  const start = Date.now();
  updateProgress(start, durationMs, media);
  if (slide.video && media) {
    media.currentTime = 0;
    media.play().catch(() => {});
    media.onended = nextSlide;
    slideTimer = setTimeout(nextSlide, Math.max(durationMs, 2500));
  } else {
    slideTimer = setTimeout(nextSlide, durationMs);
  }
}

function showSlide(nextIndex) {
  if (!slides.length) return;
  index = nextIndex;
  const slide = slides[index];
  $('#counter').textContent = `${index + 1}/${slides.length}`;
  $('#nowTitle').textContent = slide.title;
  $('#nowFile').textContent = slide.file;
  $('#screenMedia').innerHTML = slide.video
    ? `<video src="${esc(slide.src)}" muted playsinline preload="auto"></video>`
    : `<img src="${esc(slide.src)}" alt="">`;
  $('#strip').querySelectorAll('.thumb').forEach((el, i) => el.classList.toggle('on', i === index));
  schedule(slide, currentMedia());
}

function togglePlay() {
  playing = !playing;
  $('#btnPlay').textContent = playing ? 'Pausa' : 'Reproducir';
  const media = currentMedia();
  if (playing) {
    if (media && media.tagName === 'VIDEO') media.play().catch(() => {});
    schedule(slides[index], media);
  } else {
    clearPlayback();
    if (media && media.tagName === 'VIDEO') media.pause();
  }
}

function renderStrip() {
  $('#strip').innerHTML = slides.map((s, i) => {
    const media = s.video
      ? `<video class="thumb-media" src="${esc(s.src)}" muted preload="metadata"></video>`
      : `<img class="thumb-media" src="${esc(s.src)}" alt="">`;
    return `<button class="thumb" data-i="${i}">
      ${media}
      <div class="thumb-title">${i + 1}. ${esc(s.title)}</div>
    </button>`;
  }).join('');
}

function renderList() {
  $('#content').innerHTML = `<div class="grid">${slides.map((s, i) => {
    const media = s.video
      ? `<video class="media" src="${esc(s.src)}" controls muted playsinline preload="metadata"></video>`
      : `<img class="media" src="${esc(s.src)}" alt="">`;
    return `<article class="card">
      ${media}
      <div class="meta">
        <div class="top"><span class="num">${i + 1}</span><div class="title">${esc(s.title)}</div></div>
        <div class="file">${esc(s.file)}</div>
        <div class="tags">
          <span class="tag">${esc(s.type)}</span>
          <span class="tag">${Number(s.duration || 10)}s</span>
          ${s.video ? '<span class="tag">MP4 animado</span>' : ''}
        </div>
      </div>
    </article>`;
  }).join('')}</div>`;
}

function renderPlayer(items, cardsById) {
  const stamp = Date.now();
  slides = items.map((item) => {
    const card = cardsById.get(item.id) || {};
    return {
      id: item.id,
      title: card.title || item.id || '(sin título)',
      file: item.file,
      duration: item.duration || card.duration || 10,
      type: card.type || item.type,
      video: isVideo(card, item),
      src: outputUrl(card, item, stamp),
    };
  });
  if (!slides.length) {
    $('#content').innerHTML = '<div class="empty">No hay cartelas activas para revisar.</div>';
    return;
  }
  $('#loading').style.display = 'none';
  $('#player').classList.add('ready');
  renderStrip();
  renderList();
  playing = true;
  $('#btnPlay').textContent = 'Pausa';
  showSlide(0);
}

function publishError(r) {
  for (const k of ['generate', 'sequence', 'upload']) {
    if (r && r.steps && r.steps[k] && r.steps[k].ok === false) return r.steps[k].error || `Fallo en ${k}`;
  }
  return 'No se pudo preparar la vista previa.';
}

async function load() {
  clearPlayback();
  slides = [];
  index = 0;
  $('#btnReload').disabled = true;
  $('#loading').style.display = '';
  $('#player').classList.remove('ready');
  $('#content').innerHTML = '';
  $('#liveLog').textContent = 'Arrancando...';
  loadStarted = Date.now() - 1000;
  startProgress();
  try {
    const result = await api('/publish', { method: 'POST', body: JSON.stringify({ dryRun: true }) });
    if (!result.ok) throw new Error(publishError(result));
    const cards = await api('/cards');
    const manifest = (result.steps.sequence && result.steps.sequence.manifest) || [];
    const map = new Map(cards.map((c) => [c.id, c]));
    renderPlayer(manifest, map);
    const files = (result.steps.sequence && result.steps.sequence.files) || manifest.map((m) => m.file);
    const playlistText = files.includes('playlist.json') ? ', incluyendo <b>playlist.json</b>' : '';
    $('#status').innerHTML = `Simulación lista: <b>${manifest.length}</b> cartela(s). Si publicas ahora, se subirían <b>${files.length}</b> archivo(s)${playlistText}.`;
  } catch (e) {
    $('#content').innerHTML = `<div class="error">${esc(e.message)}</div>`;
    $('#status').textContent = 'No se pudo preparar la vista previa.';
  } finally {
    stopProgress();
    $('#btnReload').disabled = false;
  }
}

$('#btnReload').addEventListener('click', load);
$('#btnPrev').addEventListener('click', prevSlide);
$('#btnNext').addEventListener('click', nextSlide);
$('#btnPlay').addEventListener('click', togglePlay);
$('#btnFull').addEventListener('click', () => $('#screen').requestFullscreen && $('#screen').requestFullscreen());
$('#strip').addEventListener('click', (e) => {
  const b = e.target.closest('.thumb');
  if (b) showSlide(Number(b.dataset.i));
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    const media = currentMedia();
    if (media && media.tagName === 'VIDEO') media.pause();
  } else if (playing) {
    showSlide(index);
  }
});

load();
