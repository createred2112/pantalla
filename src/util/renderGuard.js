'use strict';

const fs = require('fs');
const os = require('os');
const { cfg } = require('../config');

function memInfo() {
  try {
    const txt = fs.readFileSync('/proc/meminfo', 'utf8');
    const get = (k) => {
      const m = txt.match(new RegExp(`^${k}:\\s+(\\d+)\\s+kB`, 'm'));
      return m ? Math.round(Number(m[1]) / 1024) : null;
    };
    return { totalMb: get('MemTotal'), availableMb: get('MemAvailable') || get('MemFree') };
  } catch {
    return {
      totalMb: Math.round(os.totalmem() / 1024 / 1024),
      availableMb: Math.round(os.freemem() / 1024 / 1024),
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
