'use strict';
// Pipeline completo: import -> generate -> sequence -> upload.
const { importWorker } = require('./importWorker');
const { generate } = require('./generate');
const { sequence } = require('./sequence');
const { upload } = require('./upload');
const log = require('../util/logger');
const status = require('../util/status');

function stop(steps, stage, error) {
  log.warn('publish', `Publicación detenida: ${error}`);
  if (!steps.upload) {
    steps.upload = { ok: false, skipped: true, error: `No se sube porque falló ${stage}` };
    status.set('upload', steps.upload);
  }
  log.info('publish', '=== Fin de publicación (ok=false) ===');
  return { ok: false, steps };
}

async function publish({ dryRun, skipImport } = {}) {
  log.info('publish', '=== Inicio de publicación ===');
  const steps = {};
  if (!skipImport) steps.import = importWorker();
  steps.generate = await generate();
  if (steps.generate.ok === false) {
    return stop(steps, 'generate', 'falló generate');
  }
  steps.sequence = sequence({ dryRun });
  if (steps.sequence.ok === false) {
    return stop(steps, 'sequence', 'falló sequence');
  }
  const plannedFiles = dryRun ? [...(steps.sequence.files || []), 'playlist.json'] : undefined;
  steps.upload = await upload({ dryRun, files: plannedFiles });
  const ok = steps.generate.ok && steps.sequence.ok && steps.upload.ok;
  log.info('publish', `=== Fin de publicación (ok=${ok}) ===`);
  return { ok, steps };
}

module.exports = { publish };
