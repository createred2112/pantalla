'use strict';
// Etapa UPLOAD: sube el contenido de publish/ al FTP, sobreescribiendo.
// Soporta dry-run (sin credenciales) para probar el resto del pipeline.
const fs = require('fs');
const path = require('path');
const ftp = require('basic-ftp');
const { paths, ftpConfig } = require('../config');
const log = require('../util/logger');
const status = require('../util/status');

function listPublishFiles() {
  if (!fs.existsSync(paths.publish)) return [];
  return fs.readdirSync(paths.publish)
    .filter((f) => fs.statSync(path.join(paths.publish, f)).isFile());
}

async function upload({ dryRun, files: plannedFiles, source = 'manual' } = {}) {
  const files = (plannedFiles != null ? plannedFiles : listPublishFiles()).map((f) => path.basename(String(f)));
  if (!files.length) {
    const r = { ok: false, source, files, error: dryRun ? 'La prueba no tiene archivos para subir' : 'publish/ está vacío; ejecuta sequence primero' };
    status.set('upload', r);
    log.warn('upload', r.error);
    return r;
  }

  const ftpCfg = ftpConfig();
  const hasCreds = ftpCfg.host && ftpCfg.user;
  if (dryRun || !hasCreds) {
    const reason = dryRun ? 'dry-run solicitado' : 'faltan credenciales FTP';
    log.warn('upload', `Subida simulada (${reason}). Archivos: ${files.join(', ')}`);
    const r = { ok: true, dryRun: true, source, files, reason, remoteDir: ftpCfg.remoteDir };
    status.set('upload', r);
    return r;
  }

  const client = new ftp.Client(30000);
  client.ftp.verbose = false;
  const progressBase = { source, files, remoteDir: ftpCfg.remoteDir, count: files.length };
  const setProgress = (patch = {}) => status.set('upload', { ok: null, running: true, ...progressBase, ...patch });
  try {
    setProgress({ phase: 'connecting', done: 0, current: null });
    await client.access({
      host: ftpCfg.host,
      port: ftpCfg.port,
      user: ftpCfg.user,
      password: ftpCfg.password,
      secure: ftpCfg.secure,
      // Por defecto se verifica el certificado TLS. Para servidores con
      // certificado auto-firmado (algunos paneles), activar ftp.allowInvalidCert
      // en la config o FTP_ALLOW_INVALID_CERT=true en .env.
      secureOptions: { rejectUnauthorized: !ftpCfg.allowInvalidCert },
    });
    setProgress({ phase: 'connected', done: 0, current: null });
    log.info('upload', `Conectado a ${ftpCfg.host}:${ftpCfg.port} (secure=${ftpCfg.secure})`);

    setProgress({ phase: 'remote-dir', done: 0, current: null });
    await client.ensureDir(ftpCfg.remoteDir);

    if (ftpCfg.clearRemoteFirst) {
      try {
        setProgress({ phase: 'clearing', done: 0, current: null });
        await client.clearWorkingDir();
        log.info('upload', 'Carpeta remota limpiada');
      } catch (e) {
        log.warn('upload', `No se pudo limpiar remoto: ${e.message}`);
      }
    }

    let done = 0;
    let current = '';
    let lastProgress = 0;
    client.trackProgress((info) => {
      const now = Date.now();
      if (now - lastProgress < 1000) return;
      lastProgress = now;
      setProgress({
        phase: 'uploading',
        done,
        current: path.basename(info.name || current || ''),
        currentBytes: Number(info.bytes) || 0,
        bytesOverall: Number(info.bytesOverall) || 0,
      });
    });

    for (const file of files) {
      current = file;
      const local = path.join(paths.publish, file);
      if (!fs.existsSync(local)) throw new Error(`No existe ${file} en publish/`);
      setProgress({ phase: 'uploading', done, current, currentBytes: 0 });
      await client.uploadFrom(local, file);
      done++;
      setProgress({ phase: 'uploading', done, current, currentBytes: 0 });
      log.info('upload', `Subido ${done}/${files.length}: ${file}`);
    }
    client.trackProgress();
    log.info('upload', `Subidos ${files.length} archivo(s) a ${ftpCfg.remoteDir}`);

    const r = { ok: true, running: false, source, files, count: files.length, done: files.length, remoteDir: ftpCfg.remoteDir };
    status.set('upload', r);
    return r;
  } catch (e) {
    const r = { ok: false, running: false, source, files, remoteDir: ftpCfg.remoteDir, error: e.message };
    status.set('upload', r);
    log.error('upload', `Fallo FTP: ${e.message}`);
    return r;
  } finally {
    client.close();
  }
}

async function testFtpConnection() {
  const ftpCfg = ftpConfig();
  if (!ftpCfg.host || !ftpCfg.user || !ftpCfg.password) {
    return { ok: false, error: 'Faltan servidor, usuario o contraseña FTP' };
  }

  const client = new ftp.Client(30000);
  client.ftp.verbose = false;
  const remoteName = `.pantalla-test-${Date.now()}.txt`;
  const localTest = path.join(paths.logs, remoteName);
  const steps = [];

  try {
    fs.mkdirSync(paths.logs, { recursive: true });
    fs.writeFileSync(localTest, `pantalla ftp test ${new Date().toISOString()}\n`);
    await client.access({
      host: ftpCfg.host,
      port: ftpCfg.port,
      user: ftpCfg.user,
      password: ftpCfg.password,
      secure: ftpCfg.secure,
      secureOptions: { rejectUnauthorized: !ftpCfg.allowInvalidCert },
    });
    steps.push('Conexión OK');

    await client.ensureDir(ftpCfg.remoteDir);
    steps.push(`Carpeta OK: ${ftpCfg.remoteDir}`);

    await client.uploadFrom(localTest, remoteName);
    steps.push('Escritura OK');

    try {
      await client.remove(remoteName);
      steps.push('Borrado de prueba OK');
    } catch (e) {
      steps.push(`No se pudo borrar el archivo de prueba: ${e.message}`);
    }

    return {
      ok: true,
      host: ftpCfg.host,
      port: ftpCfg.port,
      secure: ftpCfg.secure,
      remoteDir: ftpCfg.remoteDir,
      steps,
    };
  } catch (e) {
    return { ok: false, error: e.message, host: ftpCfg.host, port: ftpCfg.port, remoteDir: ftpCfg.remoteDir, steps };
  } finally {
    try { fs.rmSync(localTest, { force: true }); } catch {}
    client.close();
  }
}

module.exports = { upload, testFtpConnection };
