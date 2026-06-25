'use strict';
// Pipeline completo: import -> generate -> sequence -> upload.
const { importWorker } = require('./importWorker');
const { generate } = require('./generate');
const { sequence } = require('./sequence');
const { upload } = require('./upload');
const log = require('../util/logger');

async function publish({ dryRun, skipImport } = {}) {
  log.info('publish', '=== Inicio de publicación ===');
  const steps = {};
  if (!skipImport) steps.import = importWorker();
  steps.generate = await generate();
  steps.sequence = sequence();
  steps.upload = await upload({ dryRun });
  const ok = steps.generate.ok && steps.sequence.ok && steps.upload.ok;
  log.info('publish', `=== Fin de publicación (ok=${ok}) ===`);
  return { ok, steps };
}

module.exports = { publish };
