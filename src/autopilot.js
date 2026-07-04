'use strict';
// PILOTO DE EMISIÓN: prepara/publica la pantalla con el contrato real
// (8 MP4 fijos), usando caché y repitiendo solo cuando la escaleta viva cambia.
const crypto = require('crypto');
const fs = require('fs');
const { cfg, saveConfig, ftpConfig, abs } = require('./config');
const log = require('./util/logger');
const status = require('./util/status');
const audit = require('./util/auditLog');
const store = require('./store');
const renderMeta = require('./util/renderMeta');

let _timer = null;
let _running = false;

function conf() {
  const raw = Object.assign({
    enabled: false,
    time: '08:00',
    mode: 'review', // review | publish
    liveSync: true,
    syncEveryMinutes: 10,
    retryMinutes: 30,
    maxAttempts: 3,
  }, cfg.autopilot || {});
  raw.mode = raw.mode === 'publish' || raw.mode === 'review' ? raw.mode : (raw.publish === true ? 'publish' : 'review');
  raw.publish = raw.mode === 'publish';
  return raw;
}

function setConf(partial) {
  const next = Object.assign(conf(), partial || {});
  if (!/^\d{1,2}:\d{2}$/.test(String(next.time))) next.time = '08:00';
  next.enabled = next.enabled === true;
  if (partial && Object.prototype.hasOwnProperty.call(partial, 'mode')) {
    next.mode = partial.mode === 'publish' ? 'publish' : 'review';
  } else {
    next.mode = next.publish === true ? 'publish' : 'review';
  }
  next.publish = next.mode === 'publish';
  next.liveSync = next.liveSync !== false;
  next.syncEveryMinutes = Math.max(0, Math.min(120, Number(next.syncEveryMinutes) || 0));
  next.retryMinutes = Math.max(5, Math.min(240, Number(next.retryMinutes) || 30));
  next.maxAttempts = Math.max(1, Math.min(10, Number(next.maxAttempts) || 3));
  saveConfig({ autopilot: next });
  return conf();
}

function state() {
  const st = status.read();
  return (st.stages && st.stages.autopilot) || null;
}

// Fecha local del servidor (YYYY-MM-DD).
function localDay(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function requiredCount() {
  const fixed = cfg.naming && Array.isArray(cfg.naming.fixedFiles) ? cfg.naming.fixedFiles.filter(Boolean) : [];
  return fixed.length || Number(cfg.screenProfile && cfg.screenProfile.requiredCount) || 0;
}

function sequenceSignature(cards = store.active()) {
  const required = requiredCount();
  const selected = required ? cards.slice(0, required) : cards;
  const readyFileSig = (card) => {
    const file = card.file || '';
    let mtime = 0;
    try { if (file) mtime = Math.round(fs.statSync(abs(file)).mtimeMs); } catch {}
    return `${card.id}:${file}:${mtime}`;
  };
  const sig = selected.map((c) => c.type === 'generated'
    ? `${c.id}:${renderMeta.renderHash(c)}`
    : readyFileSig(c)
  ).join('|');
  return crypto.createHash('sha1').update(sig + JSON.stringify({
    fixed: cfg.naming && cfg.naming.fixedFiles,
    profile: cfg.screenProfile,
  })).digest('hex');
}

function preflight() {
  const cards = store.active();
  const required = requiredCount();
  const selected = required ? cards.slice(0, required) : cards;
  const rendered = selected.filter((c) => c.type !== 'generated' || renderMeta.isFresh({ ...c, video: true }, { wantVideo: true })).length;
  const ftp = ftpConfig();
  return {
    requiredCount: required,
    activeCount: cards.length,
    selectedCount: selected.length,
    renderedCount: rendered,
    okCount: !required || cards.length >= required,
    okRendered: !required || rendered >= Math.min(required, selected.length),
    ftpConfigured: Boolean(ftp.host && ftp.user),
    outputFiles: (cfg.naming && cfg.naming.fixedFiles) || [],
  };
}

async function run(day, c, opts = {}) {
  const publishNow = opts.publish === true;
  const mode = opts.scheduled ? 'Pase diario' : (opts.sync ? 'Sincronización viva' : (opts.hourly ? 'Pase horario' : 'Preparación manual'));
  const uploadSource = opts.manual ? 'manual-pilot' : (opts.scheduled ? 'automatic-daily' : (opts.hourly ? 'automatic-hourly' : (opts.sync ? 'automatic-watch' : 'manual-pilot')));
  const runId = opts.runId || audit.runId(uploadSource);
  log.info('autopilot', `${mode}: escaleta del ${day}${publishNow ? ' + FTP' : ' (sin publicar: revisar antes)'}`);
  audit.event('autopilot.start', `${mode}: ${publishNow ? 'actualizar, preparar y subir' : 'actualizar y preparar'}`, {
    runId, source: uploadSource, day, mode: publishNow ? 'publish' : 'review',
    syncEveryMinutes: c.syncEveryMinutes,
  });
  // Datos frescos de los workers ANTES de materializar (tiempo, luz...).
  const forceKeys = (opts.hourly || opts.sync) ? ['weather', 'airQuality'] : [];
  try {
    const workerRefresh = await require('./workers').refreshAll(forceKeys.length ? { forceKeys } : {});
    audit.event('workers.refresh', forceKeys.length
      ? 'Datos automaticos revisados; tiempo y calidad del aire forzados'
      : 'Datos automaticos revisados segun cache',
    { runId, ok: true, forceKeys, results: workerRefresh.results });
  } catch (e) {
    audit.event('workers.refresh', 'No se pudieron refrescar datos automaticos', { runId, ok: false, error: e.message });
  }
  const r = require('./rundown').materialize({ date: day });
  audit.event('rundown.materialize', `Escaleta materializada: ${r.count || 0} cartela(s)`, { runId, ok: r.ok !== false, count: r.count });
  const sig = sequenceSignature();
  if (opts.skipIfUnchanged) {
    const stages = status.read().stages || {};
    const prevRun = opts.hourly ? (stages['autopilot-hora'] || stages['autopilot-sync'] || null) : (stages['autopilot-sync'] || null);
    if (prevRun && prevRun.signature === sig && prevRun.ok !== false) {
      log.info('autopilot', `${mode}: sin cambios; no se regenera ni se sube`);
      audit.event('autopilot.skip', 'Sin cambios: se conservan los MP4 y no se sube al FTP', {
        runId, ok: true, source: uploadSource, day, count: r.count, signature: sig,
      });
      if (opts.sync) {
        status.set('autopilot-sync', { ok: true, day, cards: r.count, published: false, prepared: !publishNow, mode: publishNow ? 'publish' : 'review', signature: sig, unchanged: true });
      }
      return { ok: true, day, cards: r.count, unchanged: true, published: false, prepared: !publishNow, signature: sig };
    }
  }
  let pub = null;
  if (publishNow) {
    pub = await require('./pipeline/publish').publish({ dryRun: false, skipImport: false, uploadSource, runId });
  } else {
    // Solo renderiza (con caché): deja las cartelas listas para REVISAR.
    try {
      const gen = await require('./pipeline/generate').generate();
      audit.event('generate.finish', `MP4 preparados: ${gen.count || 0}; reutilizados: ${gen.reused || 0}`, {
        runId, ok: gen.ok !== false, count: gen.count, reused: gen.reused,
      });
    } catch (e) {
      audit.event('generate.finish', 'Fallo al preparar MP4', { runId, ok: false, error: e.message });
      log.warn('autopilot', 'Fallo al renderizar: ' + e.message);
    }
  }
  const ok = Boolean(r.ok !== false && (!pub || pub.ok));
  // Solo la ejecución PROGRAMADA marca el día como hecho: la preparación
  // manual no debe impedir que el piloto corra a su hora.
  if (opts.scheduled) {
    const prev = state();
    const attempts = ok ? 0 : ((prev && prev.day === day ? Number(prev.attempts || 0) : 0) + 1);
    status.set('autopilot', { ok, day, cards: r.count, published: Boolean(pub && pub.ok), prepared: !publishNow, mode: publishNow ? 'publish' : 'review', attempts, signature: sig });
  }
  if (opts.sync) {
    status.set('autopilot-sync', { ok, day, cards: r.count, published: Boolean(pub && pub.ok), prepared: !publishNow, mode: publishNow ? 'publish' : 'review', signature: sig });
  }
  log[ok ? 'info' : 'warn']('autopilot',
    `${mode} ${ok ? 'OK' : 'con fallos'}: ${r.count} cartela(s)` +
    (pub ? (pub.ok ? ' · publicado en pantalla' : ' · FALLO al publicar (mira el log)') : ' · pendiente de revisión y publicación manual'));
  audit.event('autopilot.finish', `${mode} ${ok ? 'OK' : 'con fallos'}`, {
    runId, ok, source: uploadSource, day, cards: r.count, published: Boolean(pub && pub.ok),
    prepared: !publishNow, signature: sig,
  });
  return { ok, day, cards: r.count, published: Boolean(pub && pub.ok), prepared: !publishNow, signature: sig, runId };
}

async function tick() {
  const c = conf();
  if (!c.enabled || _running) return;
  const now = new Date();
  const day = localDay(now);
  const [hh, mm] = String(c.time).split(':').map(Number);
  if (now.getHours() * 60 + now.getMinutes() < hh * 60 + mm) return; // aún no es la hora
  const last = state();
  const dailyDone = Boolean(last && last.day === day && last.ok !== false);

  if (!dailyDone) {
    if (last && last.day === day) {
      // Falló (p. ej. FTP caído): reintenta cada 30 min, máximo 3 intentos.
      if (Number(last.attempts || 1) >= c.maxAttempts) return;
      if (Date.now() - Date.parse(last.ts || 0) < c.retryMinutes * 60000) return;
    }
    _running = true;
    try {
      await run(day, c, { publish: c.publish !== false, scheduled: true });
    } catch (e) {
      const prev = state();
      const attempts = (prev && prev.day === day ? Number(prev.attempts || 0) : 0) + 1;
      status.set('autopilot', { ok: false, day, error: e.message, attempts });
      log.error('autopilot', `Fallo del pase diario (intento ${attempts}/${c.maxAttempts}): ` + e.message);
    } finally {
      _running = false;
    }
    return;
  }

  if (c.liveSync && Number(c.syncEveryMinutes || 0) > 0) {
    const st = status.read().stages || {};
    const sync = st['autopilot-sync'] || null;
    if (!sync || Date.now() - Date.parse(sync.ts || 0) >= Number(c.syncEveryMinutes) * 60000) {
      _running = true;
      try {
        await run(day, c, { publish: c.publish !== false, sync: true, skipIfUnchanged: true });
      } finally {
        _running = false;
      }
      return;
    }
  }

  // Pase HORARIO: si el guion tiene bloques horarios o datos que deben respirar
  // cada hora, se prepara al cambiar la hora (el caché evita trabajo de más).
  try {
    const rd = require('./rundown').read({ date: day });
    const hasHourly = (rd.rundown.slots || []).some((s) =>
      s.enabled !== false && (s.rotation === 'hora' || (s.source === 'worker' && ['weather', 'airQuality'].includes(s.workerKey)))
    );
    if (!hasHourly) return;
    const hourKey = `${day}T${String(now.getHours()).padStart(2, '0')}`;
    const st = status.read().stages || {};
    const hs = st['autopilot-hora'] || null;
    if (hs && hs.hourKey === hourKey) return; // esta hora ya está emitida
    _running = true;
    try {
      const r = await run(day, c, { publish: c.publish !== false, hourly: true, skipIfUnchanged: true });
      status.set('autopilot-hora', { ok: r.ok, hourKey, signature: r.signature || null, unchanged: r.unchanged === true });
    } finally {
      _running = false;
    }
  } catch (e) {
    log.warn('autopilot', 'Pase horario: ' + e.message);
  }
}

// Ejecución manual inmediata desde el panel. Por defecto PREPARA (datos +
// escaleta + render) sin publicar: la publicación pasa por revisión humana.
async function runNow(opts = {}) {
  if (_running) throw new Error('el piloto ya está ejecutándose');
  _running = true;
  try { return await run(localDay(), conf(), { publish: opts.publish === true, sync: opts.sync === true, manual: true }); }
  finally { _running = false; }
}

function start() {
  if (_timer) return;
  _timer = setInterval(() => { tick().catch(() => {}); }, 30000);
  if (_timer.unref) _timer.unref();
  const c = conf();
  log.info('autopilot', c.enabled
    ? `Piloto de emisión ACTIVO: ${c.mode === 'publish' ? 'publica' : 'prepara'} cada día a las ${c.time}${c.liveSync ? ` y vigila cada ${c.syncEveryMinutes} min` : ''}`
    : 'Piloto de emisión apagado (actívalo desde el panel)');
}

module.exports = { start, conf, setConf, state, tick, runNow, preflight };
