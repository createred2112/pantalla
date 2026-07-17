'use strict';
// F3: las palabras internas no deben volver a filtrarse a los textos visibles.
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const sources = [
  fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8'),
  fs.readFileSync(path.join(ROOT, 'public', 'app.js'), 'utf8'),
  fs.readFileSync(path.join(ROOT, 'src', 'pipeline', 'upload.js'), 'utf8'),
  fs.readFileSync(path.join(ROOT, 'src', 'server.js'), 'utf8'),
  fs.readFileSync(path.join(ROOT, 'src', 'takeover.js'), 'utf8'),
  fs.readFileSync(path.join(ROOT, 'src', 'util', 'operationLog.js'), 'utf8'),
];

const forbidden = [
  'MODO TAKEOVER',
  'Takeover ACTIVO',
  '>worker</span>',
  'Worker:',
  'MP4 cacheados',
  'desde caché',
  'sin renderizar',
  'no pasa por el render',
  'Rollback con error',
  'hacer el rollback',
  'dry-run solicitado',
  '(caché de hoy)',
  'TAKEOVER activado',
  'Takeover desactivado',
  'Rollback a la tanda anterior',
  'Layout guardado',
  'Render manual',
];

for (const phrase of forbidden) {
  assert(!sources.some((source) => source.includes(phrase)), `texto interno visible: ${phrase}`);
}

console.log('OK: interfaz sin jerga interna conocida');
