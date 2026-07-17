'use strict';
// Antes del humo: copia de seguridad de los datos vivos + entorno seguro.
// 1) Snapshot de data/*.json y config/*.json (se restaura en global-teardown).
// 2) FTP ANULADO en la config de pruebas: aunque este equipo tenga las
//    credenciales reales, el humo jamás puede subir nada a la pantalla.
// 3) Piloto y autopublicación APAGADOS: el humo debe ser determinista.
// 4) Admin de pruebas "qa-e2e" (desaparece al restaurar el snapshot).
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const SNAP = path.join(__dirname, '.qa-snapshot');

const FILES = [
  'data/cards.json',
  'data/rundown.json',
  'data/content-library.json',
  'data/user-templates.json',
  'data/template-layouts.json',
  'data/template-layouts.v2.json',
  'data/worker-data.json',
  'data/takeover.json',
  'data/push-subs.json',
  'config/pantalla.config.json',
  'config/admins.json',
];

module.exports = async () => {
  // Si quedó un snapshot huérfano (una pasada anterior murió a medias),
  // PRIMERO se restaura: así nunca se fotografía un estado contaminado.
  if (fs.existsSync(path.join(SNAP, 'manifest.json'))) {
    await require('./global-teardown')();
  }
  fs.rmSync(SNAP, { recursive: true, force: true });
  fs.mkdirSync(SNAP, { recursive: true });
  const present = [];
  for (const rel of FILES) {
    const full = path.join(ROOT, rel);
    if (!fs.existsSync(full)) continue;
    const dest = path.join(SNAP, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(full, dest);
    present.push(rel);
  }
  const absent = FILES.filter((rel) => !present.includes(rel));
  fs.writeFileSync(path.join(SNAP, 'manifest.json'), JSON.stringify({ present, absent, at: new Date().toISOString() }, null, 2));

  // Config de pruebas: FTP fuera, automatismos fuera, push fuera.
  const cfgFile = path.join(ROOT, 'config', 'pantalla.config.json');
  const cfg = JSON.parse(fs.readFileSync(cfgFile, 'utf8'));
  cfg.ftp = {};
  cfg.autopublish = { enabled: false };
  cfg.autopilot = { ...(cfg.autopilot || {}), enabled: false, liveSync: false };
  fs.writeFileSync(cfgFile, JSON.stringify(cfg, null, 2));
  const pushFile = path.join(ROOT, 'data', 'push-subs.json');
  if (fs.existsSync(pushFile)) fs.writeFileSync(pushFile, '[]');

  // Admin de pruebas (si ya existe de una pasada anterior, vale igual).
  try { require(path.join(ROOT, 'src', 'auth')).addAdmin('qa-e2e', 'humo-pantalla-qa'); }
  catch (e) { if (!/ya existe/i.test(e.message)) throw e; }
};
