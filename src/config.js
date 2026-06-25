'use strict';
// Carga de configuración y resolución de rutas relativas a la raíz del proyecto.
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const ROOT = path.resolve(__dirname, '..');
const CONFIG_PATH = path.join(ROOT, 'config', 'pantalla.config.json');

function load() {
  const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  return cfg;
}

const cfg = load();

// Convierte una ruta relativa de la config en absoluta (respeta absolutas).
function abs(p) {
  if (!p) return p;
  return path.isAbsolute(p) ? p : path.join(ROOT, p);
}

const paths = {};
for (const [k, v] of Object.entries(cfg.paths)) paths[k] = abs(v);

// --- Fuentes empaquetadas (vía fontconfig) ---
// Genera un fonts.conf que apunta a assets/fonts y lo activa con FONTCONFIG_FILE.
// Debe ejecutarse ANTES de cargar sharp/librsvg para que las detecte.
(function setupFonts() {
  const fontsDir = abs('assets/fonts');
  if (!fs.existsSync(fontsDir)) return;
  const fwd = (p) => p.replace(/\\/g, '/');
  const cacheDir = path.join(fontsDir, '.cache');
  try { fs.mkdirSync(cacheDir, { recursive: true }); } catch {}
  const conf =
    `<?xml version="1.0"?>\n<!DOCTYPE fontconfig SYSTEM "fonts.dtd">\n<fontconfig>\n` +
    `  <dir>${fwd(fontsDir)}</dir>\n` +
    `  <cachedir>${fwd(cacheDir)}</cachedir>\n</fontconfig>\n`;
  const confPath = path.join(fontsDir, 'fonts.conf');
  try {
    fs.writeFileSync(confPath, conf);
    process.env.FONTCONFIG_FILE = confPath;
    process.env.FONTCONFIG_PATH = fontsDir;
  } catch {}
})();

// Asegura que existan los directorios de trabajo.
function ensureDirs() {
  const dirs = [
    paths.assets, paths.workerInbox, paths.output,
    paths.publish, paths.logs, paths.uploads,
    path.dirname(paths.data),
  ];
  for (const d of dirs) fs.mkdirSync(d, { recursive: true });
}

const env = {
  ftp: {
    host: process.env.FTP_HOST,
    port: Number(process.env.FTP_PORT || 21),
    user: process.env.FTP_USER,
    password: process.env.FTP_PASSWORD,
    secure: String(process.env.FTP_SECURE || cfg.ftp.secure) === 'true',
  },
  port: Number(process.env.PORT || 8080),
  panelToken: process.env.PANEL_TOKEN || '',
};

// Mezcla profunda (objetos planos) usada por saveConfig.
function deepMerge(target, src) {
  for (const k of Object.keys(src)) {
    if (src[k] && typeof src[k] === 'object' && !Array.isArray(src[k])) {
      target[k] = deepMerge(target[k] && typeof target[k] === 'object' ? target[k] : {}, src[k]);
    } else {
      target[k] = src[k];
    }
  }
  return target;
}

// Aplica cambios (parciales) a la config: actualiza el objeto en memoria (para
// que los renders los usen ya) y reescribe el JSON en disco.
function saveConfig(partial) {
  deepMerge(cfg, partial);
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
  return cfg;
}

module.exports = { ROOT, cfg, paths, abs, ensureDirs, env, reload: load, saveConfig };
