'use strict';
// Carga de configuración y resolución de rutas relativas a la raíz del proyecto.
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const ROOT = path.resolve(__dirname, '..');
const CONFIG_PATH = path.join(ROOT, 'config', 'pantalla.config.json');
const CONFIG_DEFAULT = path.join(ROOT, 'config', 'pantalla.config.default.json');
const QA_MODE = process.env.PANTALLA_QA === '1';

// La config es "viva" (editable desde el panel) y NO está en git. Si no existe
// (clon nuevo), se crea a partir de la plantilla por defecto.
if (!fs.existsSync(CONFIG_PATH) && fs.existsSync(CONFIG_DEFAULT)) {
  fs.copyFileSync(CONFIG_DEFAULT, CONFIG_PATH);
}

function load() {
  const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  return migrateProductionContract(cfg);
}

const FIXED_SCREEN_FILES = [
  'berri-1.mp4',
  'berri-2.mp4',
  'berri-3.mp4',
  'berri-4.mp4',
  'berri-5.mp4',
  'berri-6.mp4',
  'berri-7.mp4',
  'berri-8.mp4',
];

function migrateProductionContract(c) {
  c.palette = c.palette && typeof c.palette === 'object' ? c.palette : {};
  c.palette.naranja = c.palette.naranja || {
    bg: '#FF8A00',
    bg2: '#FF8A00',
    text: '#0E0E0E',
    textMuted: 'rgba(14,14,14,0.76)',
    accent: '#0E0E0E',
    accentText: '#FFFFFF',
    logoAccent: '#0E0E0E',
  };
  c.screen = { ...(c.screen || {}), format: 'mp4' };
  c.naming = {
    ...(c.naming || {}),
    pattern: 'berri-{n}',
    fixedFiles: FIXED_SCREEN_FILES,
    lowercase: true,
  };
  c.screenProfile = {
    ...(c.screenProfile || {}),
    acceptImage: false,
    acceptVideo: true,
    includePlaylist: false,
    forceVideo: true,
    outputFormat: 'mp4',
    requiredCount: FIXED_SCREEN_FILES.length,
  };
  c.templateBumpers = c.templateBumpers && typeof c.templateBumpers === 'object' ? c.templateBumpers : {};
  // F3: el diseño GIGANTE es el único diseño del producto. Se conserva esta
  // propiedad para que los datos y firmas creados con v2 sigan siendo válidos.
  c.design = { version: 'v2' };
  return c;
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
  simpleUsers: String(process.env.SIMPLE_USERS || 'jon')
    .split(',')
    .map((u) => u.trim().toLowerCase())
    .filter(Boolean),
};

function ftpConfig() {
  // Defensa final del humo e2e: aunque el servidor ya hubiera cargado la
  // config real antes del snapshot, en modo QA nunca devuelve credenciales.
  if (QA_MODE) {
    return {
      host: '', port: 21, user: '', password: '', secure: false,
      remoteDir: '/', clearRemoteFirst: false, allowInvalidCert: false,
      source: { host: 'qa', user: 'qa', password: 'qa' },
    };
  }
  const f = cfg.ftp || {};
  const usesConfig = Boolean(f.host || f.user || f.password);
  return {
    host: f.host || process.env.FTP_HOST || '',
    port: Number(usesConfig ? (f.port || 21) : (process.env.FTP_PORT || f.port || 21)),
    user: f.user || process.env.FTP_USER || '',
    password: f.password || process.env.FTP_PASSWORD || '',
    secure: usesConfig ? String(f.secure || false) === 'true' : (process.env.FTP_SECURE != null ? String(process.env.FTP_SECURE) === 'true' : String(f.secure || false) === 'true'),
    remoteDir: f.remoteDir || '/',
    clearRemoteFirst: f.clearRemoteFirst === true,
    // Aceptar certificados TLS inválidos (auto-firmados) SOLO si se pide
    // explícitamente; por defecto se verifica el certificado del servidor.
    allowInvalidCert: f.allowInvalidCert === true || String(process.env.FTP_ALLOW_INVALID_CERT || '') === 'true',
    source: {
      host: f.host ? 'config' : 'env',
      user: f.user ? 'config' : 'env',
      password: f.password ? 'config' : 'env',
    },
  };
}

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
  require('./util/atomicWrite').writeJsonAtomic(CONFIG_PATH, cfg);
  return cfg;
}

module.exports = { ROOT, cfg, paths, abs, ensureDirs, env, ftpConfig, QA_MODE, reload: load, saveConfig };
