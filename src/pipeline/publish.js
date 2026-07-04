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

async function publishLocked({ dryRun, skipImport, uploadSource = 'manual', runId } = {}) {
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
    const refresh = await require('../workers').refreshAll();
    audit.event('publish.workers', 'Datos automaticos revisados antes de generar', { runId, ok: true, results: refresh.results });
  } catch (e) {
    audit.event('publish.workers', 'No se pudieron refrescar datos automaticos antes de generar', { runId, ok: false, error: e.message });
    log.warn('publish', `No se pudieron refrescar datos automáticos: ${e.message}`);
  }
  steps.rundown = require('../rundown').materialize();
  audit.event('publish.rundown', `Escaleta preparada: ${steps.rundown.count || 0} cartela(s)`, { runId, ok: steps.rundown.ok !== false, result: steps.rundown });
  steps.generate = await generate();
  audit.event('publish.generate', `MP4 preparados: ${steps.generate.count || 0}; reutilizados: ${steps.generate.reused || 0}`, {
    runId, ok: steps.generate.ok !== false, count: steps.generate.count, reused: steps.generate.reused,
  });
  if (steps.generate.ok === false) {
    return stop(steps, 'generate', 'falló generate', uploadSource, runId);
  }
  steps.sequence = sequence({ dryRun });
  audit.event('publish.sequence', `Secuencia final: ${steps.sequence.count || 0} archivo(s)`, {
    runId, ok: steps.sequence.ok !== false, dryRun: Boolean(dryRun),
    files: steps.sequence.files, requiredCount: steps.sequence.requiredCount,
    omitted: steps.sequence.omitted, error: steps.sequence.error,
  });
  if (steps.sequence.ok === false) {
    return stop(steps, 'sequence', 'falló sequence', uploadSource, runId);
  }
  const plannedFiles = dryRun ? (steps.sequence.files || []) : undefined;
  steps.upload = await upload({ dryRun, files: plannedFiles, source: uploadSource });
  const ok = steps.generate.ok && steps.sequence.ok && steps.upload.ok;
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
