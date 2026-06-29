'use strict';
// Etapa UPLOAD: sube el contenido de publish/ al FTP, sobreescribiendo.
// Soporta dry-run (sin credenciales) para probar el resto del pipeline.
const fs = require('fs');
const path = require('path');
const ftp = require('basic-ftp');
const { cfg, paths, env } = require('../config');
const log = require('../util/logger');
const status = require('../util/status');

function listPublishFiles() {
  if (!fs.existsSync(paths.publish)) return [];
  return fs.readdirSync(paths.publish)
    .filter((f) => fs.statSync(path.join(paths.publish, f)).isFile());
}

async function upload({ dryRun, files: plannedFiles } = {}) {
  const files = plannedFiles != null ? plannedFiles : listPublishFiles();
  if (!files.length) {
    const r = { ok: false, error: dryRun ? 'La prueba no tiene archivos para subir' : 'publish/ está vacío; ejecuta sequence primero' };
    status.set('upload', r);
    log.warn('upload', r.error);
    return r;
  }

  const hasCreds = env.ftp.host && env.ftp.user;
  if (dryRun || !hasCreds) {
    const reason = dryRun ? 'dry-run solicitado' : 'faltan credenciales FTP en .env';
    log.warn('upload', `Subida simulada (${reason}). Archivos: ${files.join(', ')}`);
    const r = { ok: true, dryRun: true, files, reason, remoteDir: cfg.ftp.remoteDir };
    status.set('upload', r);
    return r;
  }

  const client = new ftp.Client(30000);
  client.ftp.verbose = false;
  try {
    await client.access({
      host: env.ftp.host,
      port: env.ftp.port,
      user: env.ftp.user,
      password: env.ftp.password,
      secure: env.ftp.secure,
      // Acepta certificados TLS auto-firmados / con nombre no coincidente (FTPS
      // de paneles como CloudPanel). El canal sigue cifrado.
      secureOptions: { rejectUnauthorized: false },
    });
    log.info('upload', `Conectado a ${env.ftp.host}:${env.ftp.port} (secure=${env.ftp.secure})`);

    await client.ensureDir(cfg.ftp.remoteDir);

    if (cfg.ftp.clearRemoteFirst) {
      try {
        await client.clearWorkingDir();
        log.info('upload', 'Carpeta remota limpiada');
      } catch (e) {
        log.warn('upload', `No se pudo limpiar remoto: ${e.message}`);
      }
    }

    // Sube todo publish/ (incluye playlist.json); sobreescribe por defecto.
    await client.uploadFromDir(paths.publish);
    log.info('upload', `Subidos ${files.length} archivo(s) a ${cfg.ftp.remoteDir}`);

    const r = { ok: true, files, remoteDir: cfg.ftp.remoteDir };
    status.set('upload', r);
    return r;
  } catch (e) {
    const r = { ok: false, error: e.message };
    status.set('upload', r);
    log.error('upload', `Fallo FTP: ${e.message}`);
    return r;
  } finally {
    client.close();
  }
}

module.exports = { upload };
