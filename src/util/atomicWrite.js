'use strict';
// Escritura atómica: volcado a archivo temporal + rename en el mismo directorio.
// Evita que un corte (crash, apagón, disco lleno) a mitad de escritura deje el
// JSON corrupto: el rename es atómico y el archivo viejo sobrevive intacto.
const fs = require('fs');
const path = require('path');

function writeFileAtomic(file, content, opts = {}) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  try {
    fs.writeFileSync(tmp, content, opts.mode != null ? { mode: opts.mode } : undefined);
    fs.renameSync(tmp, file);
  } catch (e) {
    try { fs.rmSync(tmp, { force: true }); } catch {}
    throw e;
  }
}

function writeJsonAtomic(file, data, opts = {}) {
  writeFileAtomic(file, JSON.stringify(data, null, 2), opts);
  return data;
}

module.exports = { writeFileAtomic, writeJsonAtomic };
