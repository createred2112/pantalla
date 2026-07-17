'use strict';
// Después del humo: restaurar EXACTAMENTE los datos y la config previos.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const SNAP = path.join(__dirname, '.qa-snapshot');

module.exports = async () => {
  let manifest = null;
  try { manifest = JSON.parse(fs.readFileSync(path.join(SNAP, 'manifest.json'), 'utf8')); } catch {}
  if (!manifest) return; // sin snapshot no se toca nada
  for (const rel of manifest.present) {
    const src = path.join(SNAP, rel);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(ROOT, rel));
  }
  // Lo que no existía antes del humo y se haya creado durante él, se retira.
  for (const rel of manifest.absent || []) {
    fs.rmSync(path.join(ROOT, rel), { force: true });
  }
  fs.rmSync(SNAP, { recursive: true, force: true });
};
