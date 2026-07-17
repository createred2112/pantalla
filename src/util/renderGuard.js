'use strict';

const fs = require('fs');
const os = require('os');
const { cfg } = require('../config');

// En Windows, os.freemem() INFRAVALORA mucho: no cuenta la memoria "en
// espera" (standby) que el sistema libera al instante. El contador correcto
// es AvailableMBytes (WMI, sin problemas de idioma). Se consulta como mucho
// cada 10 s y, si falla, se cae al valor conservador de siempre.
let _winMem = { at: 0, value: null };
function windowsAvailableMb() {
  if (Date.now() - _winMem.at < 10000) return _winMem.value;
  let value = null;
  try {
    const out = require('child_process').execSync(
      'powershell -NoProfile -Command "(Get-CimInstance Win32_PerfFormattedData_PerfOS_Memory).AvailableMBytes"',
      { encoding: 'utf8', timeout: 8000, windowsHide: true },
    );
    const v = Math.round(Number(String(out).trim()));
    if (Number.isFinite(v) && v > 0) value = v;
  } catch { /* sin PowerShell o sin permisos: fallback conservador */ }
  _winMem = { at: Date.now(), value };
  return value;
}

function memInfo() {
  try {
    const txt = fs.readFileSync('/proc/meminfo', 'utf8');
    const get = (k) => {
      const m = txt.match(new RegExp(`^${k}:\\s+(\\d+)\\s+kB`, 'm'));
      return m ? Math.round(Number(m[1]) / 1024) : null;
    };
    return { totalMb: get('MemTotal'), availableMb: get('MemAvailable') || get('MemFree') };
  } catch {
    const winAvail = process.platform === 'win32' ? windowsAvailableMb() : null;
    return {
      totalMb: Math.round(os.totalmem() / 1024 / 1024),
      availableMb: winAvail != null ? winAvail : Math.round(os.freemem() / 1024 / 1024),
    };
  }
}

function boolEnv(name, fallback) {
  if (process.env[name] == null) return fallback;
  return /^(1|true|yes|on)$/i.test(String(process.env[name]));
}

function safeMode() {
  const mem = memInfo();
  const byMem = mem.totalMb > 0 && mem.totalMb < Number(process.env.PANTALLA_SAFE_TOTAL_MB || 1900);
  return boolEnv('PANTALLA_SAFE_MODE', byMem);
}

function videoAllowed() {
  if (cfg.video && cfg.video.enabled === false) return false;
  if (boolEnv('PANTALLA_ALLOW_VIDEO', false)) return true;
  if (cfg.video && cfg.video.allowOnLowMemory === true) return true;
  return !safeMode();
}

function limits() {
  const safe = safeMode();
  return {
    safeMode: safe,
    minChromeMb: Number(process.env.PANTALLA_MIN_CHROME_MB || (safe ? 450 : 250)),
    minVideoMb: Number(process.env.PANTALLA_MIN_VIDEO_MB || (safe ? 900 : 550)),
  };
}

function safetyInfo() {
  const mem = memInfo();
  const lim = limits();
  return {
    ...mem,
    ...lim,
    videoAllowed: videoAllowed(),
  };
}

function assertCanUseChrome(kind = 'render') {
  const info = safetyInfo();
  const min = kind === 'video' ? info.minVideoMb : info.minChromeMb;
  if (kind === 'video' && !info.videoAllowed) {
    throw new Error('Vídeo desactivado en modo seguro: esta VPS no tiene memoria suficiente para renderizar MP4 sin riesgo.');
  }
  if (info.availableMb != null && info.availableMb < min) {
    throw new Error(`Memoria insuficiente para ${kind}: ${info.availableMb}MB libres, mínimo ${min}MB.`);
  }
  return info;
}

module.exports = { memInfo, safetyInfo, safeMode, videoAllowed, assertCanUseChrome };
