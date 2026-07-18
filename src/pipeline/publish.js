'use strict';
// Pipeline completo: import -> generate -> sequence -> upload.
const { importWorker } = require('./importWorker');
const { generate } = require('./generate');
const { sequence } = require('./sequence');
const { upload } = require('./upload');
const log = require('../util/logger');
const status = require('../util/status');
const audit = require('../util/auditLog');
const pipelineLock = require('../util/pipelineLock');

function stop(steps, stage, error, uploadSource, runId) {
  log.warn('publish', `Publicación detenida: ${error}`);
  if (!steps.upload) {
    steps.upload = { ok: false, skipped: true, source: uploadSource || 'manual', error: `No se sube porque falló ${stage}` };
    status.set('upload', steps.upload);
  }
  audit.event('publish.stop', `Publicacion detenida en ${stage}: ${error}`, { runId, ok: false, source: uploadSource || 'manual', stage, steps });
  log.info('publish', '=== Fin de publicación (ok=false) ===');
  return { ok: false, steps };
}

async function publishLocked({ dryRun, skipImport, uploadSource = 'manual', runId, _deps = {} } = {}) {
  runId = runId || audit.runId(uploadSource);
  log.info('publish', '=== Inicio de publicación ===');
  audit.event('publish.start', dryRun ? 'Comprobacion de publicacion iniciada' : 'Publicacion iniciada', {
    runId, ok: true, source: uploadSource, dryRun: Boolean(dryRun), skipImport: Boolean(skipImport),
  });
  const steps = {};
  if (!skipImport) {
    steps.import = importWorker();
    audit.event('publish.import', 'Archivos recibidos revisados', { runId, ok: steps.import.ok !== false, result: steps.import });
  }
  try {
    const refresh = await (_deps.refreshAll || require('../workers').refreshAll)();
    audit.event('publish.workers', 'Datos automaticos revisados antes de generar', { runId, ok: true, results: refresh.results });
  } catch (e) {
    audit.event('publish.workers', 'No se pudieron refrescar datos automaticos antes de generar', { runId, ok: false, error: e.message });
    log.warn('publish', `No se pudieron refrescar datos automáticos: ${e.message}`);
  }
  steps.rundown = (_deps.materialize || require('../rundown').materialize)();
  audit.event('publish.rundown', `Escaleta preparada: ${steps.rundown.count || 0} cartela(s)`, { runId, ok: steps.rundown.ok !== false, result: steps.rundown });
  const required = Number(steps.rundown.requiredCount) || 0;
  const ready = Number(steps.rundown.readyCount == null ? steps.rundown.count : steps.rundown.readyCount) || 0;
  if (steps.rundown.ok === false || (required && ready !== required)) {
    const blockers = Array.isArray(steps.rundown.blockers) ? steps.rundown.blockers : [];
    const detail = blockers.length
      ? blockers.map((item) => `${item.label}: ${item.note}`).join('; ')
      : `${ready}/${required} posiciones listas`;
    steps.rundown.error = steps.rundown.error || detail;
    return stop(steps, 'rundown', `la tanda está incompleta (${ready}/${required}): ${detail}`, uploadSource, runId);
  }
  steps.generate = await (_deps.generate || generate)();
  audit.event('publish.generate', `MP4 preparados: ${steps.generate.count || 0}; reutilizados: ${steps.generate.reused || 0}`, {
    runId, ok: steps.generate.ok !== false, count: steps.generate.count, reused: steps.generate.reused,
  });
  if (steps.generate.ok === false) {
    return stop(steps, 'generate', 'falló generate', uploadSource, runId);
  }
  steps.sequence = (_deps.sequence || sequence)({ dryRun });
  audit.event('publish.sequence', `Secuencia final: ${steps.sequence.count || 0} archivo(s)`, {
    runId, ok: steps.sequence.ok !== false, dryRun: Boolean(dryRun),
    files: steps.sequence.files, requiredCount: steps.sequence.requiredCount,
    omitted: steps.sequence.omitted, error: steps.sequence.error,
  });
  if (steps.sequence.ok === false) {
    return stop(steps, 'sequence', 'falló sequence', uploadSource, runId);
  }
  const plannedFiles = dryRun ? (steps.sequence.files || []) : undefined;
  steps.upload = await (_deps.upload || upload)({ dryRun, files: plannedFiles, source: uploadSource });
  const automatic = /^automatic-/.test(String(uploadSource || ''));
  if (!dryRun && automatic && steps.upload.ok === true && steps.upload.dryRun !== true) {
    try {
      steps.history = await require('../util/automaticHistory').create(steps.upload.files, uploadSource);
      audit.event('publish.history', `Histórico automático guardado: ${steps.history.file}`, { runId, ok: true, source: uploadSource, result: steps.history });
    } catch (e) {
      steps.history = { ok: false, error: e.message, source: uploadSource };
      status.set('history', steps.history);
      audit.event('publish.history', 'No se pudo guardar el histórico automático', { runId, ok: false, source: uploadSource, error: e.message });
      log.warn('history', `No se pudo guardar el histórico automático: ${e.message}`);
    }
  }
  const ok = steps.generate.ok && steps.sequence.ok && steps.upload.ok;
  // Subida REAL correcta → esta pasa a ser la "última tanda publicada"
  // (referencia del diff visual y del espejo de pantalla).
  if (ok && !dryRun && steps.upload.dryRun !== true) {
    try { require('./sequence').rememberPublishedTanda(steps.sequence.manifest); } catch (e) { log.warn('publish', `No se guardó la última tanda: ${e.message}`); }
    try { require('../util/emisiones').archive(steps.sequence.manifest); } catch (e) { log.warn('publish', `No se archivó la emisión: ${e.message}`); }
  }
  if (!ok && !dryRun) {
    try { require('../util/notify').notify('⚠ Publicación con fallo', 'La pantalla puede NO estar actualizada. Entra en Estado para ver el detalle.', 'publish-fail'); } catch {}
  }
  audit.event('publish.upload', ok
    ? `${dryRun ? 'Comprobacion' : 'Subida'} OK: ${(steps.upload.files || []).length} archivo(s)`
    : `${dryRun ? 'Comprobacion' : 'Subida'} con fallo`,
  {
    runId, ok: steps.upload.ok !== false, source: uploadSource, dryRun: Boolean(steps.upload.dryRun),
    files: steps.upload.files, remoteDir: steps.upload.remoteDir, error: steps.upload.error,
  });
  audit.event('publish.finish', dryRun ? `Comprobacion finalizada (ok=${ok})` : `Publicacion finalizada (ok=${ok})`, {
    runId, ok, source: uploadSource, dryRun: Boolean(dryRun),
  });
  log.info('publish', `=== Fin de publicación (ok=${ok}) ===`);
  return { ok, steps, runId };
}

async function publish(opts = {}) {
  if (opts.lock === false) return publishLocked(opts);
  const owner = opts.dryRun ? 'Comprobacion de subida' : 'Publicacion a pantalla';
  return pipelineLock.withLock(owner, () => publishLocked(opts));
}

module.exports = { publish };
