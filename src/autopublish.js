'use strict';
// PUBLICACIÓN AUTOMÁTICA AL GUARDAR ("modo confianza").
//
// Cuando está activa (config.autopublish.enabled), cada cambio que afecta a la
// emisión (guardar agenda, editar/convertir cartelas, guardar escaleta...)
// programa una publicación REAL con un colchón de espera: si sigues editando,
// el temporizador se reinicia y solo se publica cuando paras. Guardas:
//  - la etapa sequence sigue exigiendo la tanda completa (8/8) y válida;
//  - la tanda anterior queda guardada (publish-anterior/) para rollback;
//  - si algo falla, se avisa (log + push si está configurado) y NO se sube nada.
const log = require('./util/logger');
const { cfg } = require('./config');

const WAIT_MS = Number(process.env.PANTALLA_AUTOPUBLISH_WAIT_MS || 90000); // 90s de colchón
let _timer = null;
let _running = false;
let _pendingReason = '';

function enabled() {
  return Boolean(cfg.autopublish && cfg.autopublish.enabled === true);
}

function state() {
  return {
    enabled: enabled(),
    pending: Boolean(_timer),
    pendingReason: _pendingReason || null,
    waitSeconds: Math.round(WAIT_MS / 1000),
    running: _running,
  };
}

// Llamar tras cualquier cambio que deba acabar en pantalla.
function schedule(reason = 'cambios guardados') {
  if (!enabled()) return { scheduled: false };
  _pendingReason = reason;
  clearTimeout(_timer);
  _timer = setTimeout(run, WAIT_MS);
  if (_timer.unref) _timer.unref();
  log.info('autopublish', `Publicación automática en ${Math.round(WAIT_MS / 1000)}s (${reason}); nuevas ediciones reinician la espera`);
  return { scheduled: true, inSeconds: Math.round(WAIT_MS / 1000) };
}

function cancel() {
  clearTimeout(_timer);
  _timer = null;
  _pendingReason = '';
}

async function run() {
  _timer = null;
  if (!enabled() || _running) return;
  _running = true;
  const reason = _pendingReason || 'cambios guardados';
  _pendingReason = '';
  try {
    log.info('autopublish', `Publicando automáticamente (${reason})...`);
    const r = await require('./pipeline/publish').publish({ uploadSource: 'automatic-save' });
    if (r && r.ok) {
      log.info('autopublish', 'Publicación automática OK');
      try { require('./util/notify').notify('Pantalla actualizada', `Publicado automáticamente (${reason}).`, 'autopublish-ok'); } catch {}
    } else {
      const err = r && r.steps && (
        (r.steps.sequence && r.steps.sequence.error) ||
        (r.steps.upload && r.steps.upload.error) ||
        (r.steps.generate && r.steps.generate.error)
      ) || 'error desconocido';
      log.warn('autopublish', `Publicación automática detenida: ${err}`);
      try { require('./util/notify').notify('⚠ La pantalla NO se actualizó', `Publicación automática detenida: ${err}`, 'autopublish-fail'); } catch {}
    }
  } catch (e) {
    log.error('autopublish', `Publicación automática falló: ${e.message}`);
    try { require('./util/notify').notify('⚠ La pantalla NO se actualizó', `Error: ${e.message}`, 'autopublish-fail'); } catch {}
  } finally {
    _running = false;
  }
}

// Vigilante de FRANJAS HORARIAS: si la lista de cartelas en emisión cambia
// (una entra o sale de su ventana), reprograma la publicación — o avisa si la
// publicación automática está apagada.
let _windowSig = '';
function windowTick() {
  try {
    const sig = require('./store').active().map((c) => c.id).join('|');
    if (_windowSig && sig !== _windowSig) {
      if (enabled()) schedule('cambio de franja horaria');
      else {
        log.info('autopublish', 'La emisión debería cambiar por franjas horarias; publica para reflejarlo');
        try { require('./util/notify').notify('La emisión debería cambiar', 'Una cartela ha entrado o salido de su franja horaria. Publica para reflejarlo (o activa la publicación automática).', 'window-change'); } catch {}
      }
    }
    _windowSig = sig;
  } catch {}
}
function startWindows() {
  const t = setInterval(windowTick, 60000);
  if (t.unref) t.unref();
  windowTick();
}

module.exports = { schedule, cancel, state, enabled, startWindows };
