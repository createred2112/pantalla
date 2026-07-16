'use strict';
// Conmutador de versión de diseño de las cartelas.
//
//   node scripts/design-version.js          → muestra la versión activa
//   node scripts/design-version.js v2       → activa el diseño GIGANTE (v2)
//   node scripts/design-version.js v1       → rollback al diseño clásico (v1)
//
// El cambio es en caliente para nuevos renders y NO destruye nada:
//  - los layouts predeterminados viven en archivos separados por versión
//    (data/template-layouts.json ↔ data/template-layouts.v2.json);
//  - los layouts por cartela quedan etiquetados con su versión y solo se
//    aplican cuando esa versión está activa;
//  - la caché de MP4 distingue versiones: al volver a v1 se reutilizan los
//    vídeos ya generados con v1 (no se re-renderiza nada).
const { cfg, saveConfig } = require('../src/config');

const arg = String(process.argv[2] || '').trim().toLowerCase();
const current = (cfg.design && cfg.design.version) || 'v1';

if (!arg) {
  console.log(`Versión de diseño activa: ${current}`);
  console.log('Uso: node scripts/design-version.js [v1|v2]');
  process.exit(0);
}

if (arg !== 'v1' && arg !== 'v2') {
  console.error(`Versión desconocida: "${arg}". Usa v1 (clásico) o v2 (letras gigantes).`);
  process.exit(1);
}

if (arg === current) {
  console.log(`La versión ${arg} ya estaba activa. Nada que hacer.`);
  process.exit(0);
}

saveConfig({ design: { version: arg } });
console.log(`Diseño cambiado: ${current} → ${arg}.`);
console.log(arg === 'v2'
  ? 'Activado el diseño GIGANTE. Rollback en cualquier momento: npm run design:v1'
  : 'Rollback completado: diseño clásico activo, con sus layouts y cachés intactos.');
console.log('Si el panel está arrancado, reinícialo o guarda Ajustes para refrescar la vista.');
