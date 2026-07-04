'use strict';
// Convierte eventos tecnicos JSONL en un historial humano agrupado por operacion.
const auditLog = require('./auditLog');
const status = require('./status');
const logger = require('./logger');

function sourceLabel(source) {
  return {
    'automatic-daily': 'Piloto diario',
    'automatic-watch': 'Vigilancia automática',
    'automatic-hourly': 'Actualización horaria',
    'manual-pilot': 'Piloto manual',
    'manual-check': 'Comprobación manual',
    manual: 'Subida manual',
  }[source] || source || 'Operación';
}

function titleFromStart(e) {
  const msg = String(e.message || '');
  if (/Pase diario/i.test(msg)) return 'Pase diario';
  if (/Sincronizaci/i.test(msg)) return 'Vigilancia automática';
  if (/Pase horario/i.test(msg)) return 'Actualización horaria';
  if (/Comprobacion/i.test(msg)) return 'Comprobación manual';
  if (/Publicacion/i.test(msg)) return 'Subida a pantalla';
  return sourceLabel(e.source);
}

function countResults(results) {
  const values = Object.values(results || {});
  return {
    updated: values.filter((r) => r && r.ok && !r.skipped && !r.manual).length,
    cached: values.filter((r) => r && r.skipped).length,
    failed: values.filter((r) => r && r.ok === false).length,
    manual: values.filter((r) => r && r.manual).length,
  };
}

function step(label, detail, ok = true) {
  return { label, detail, ok: ok !== false };
}

function summarizeGroup(events) {
  const first = events[0] || {};
  const last = events[events.length - 1] || first;
  const start = events.find((e) => /\.start$/.test(e.type || '')) || first;
  const finish = events.find((e) => /\.finish$/.test(e.type || '')) || null;
  const upload = events.find((e) => e.type === 'publish.upload') || null;
  const skipped = events.find((e) => e.type === 'autopilot.skip') || null;
  const sequence = events.find((e) => e.type === 'publish.sequence') || null;
  const generate = events.find((e) => e.type === 'publish.generate' || e.type === 'generate.finish') || null;
  const workers = events.find((e) => e.type === 'workers.refresh' || e.type === 'publish.workers') || null;
  const busy = events.find((e) => e.type === 'pipeline.busy') || null;
  const failed = events.find((e) => e.ok === false) || null;

  const entry = {
    id: first.runId || `${first.type || 'op'}-${first.ts || Date.now()}`,
    ts: first.ts || last.ts,
    finishedAt: (finish && finish.ts) || last.ts,
    title: titleFromStart(start),
    source: sourceLabel(start.source || upload && upload.source || first.source),
    status: failed ? 'error' : (skipped ? 'skipped' : (finish || upload ? 'ok' : 'running')),
    headline: '',
    summary: '',
    steps: [],
    files: [],
    omitted: [],
  };

  if (workers) {
    const c = countResults(workers.results);
    const forced = Array.isArray(workers.forceKeys) && workers.forceKeys.length
      ? ` · forzado: ${workers.forceKeys.join(', ')}`
      : '';
    entry.steps.push(step('Datos', `${c.updated} actualizado(s), ${c.cached} en caché${forced}`, c.failed === 0));
  }
  if (generate) {
    entry.steps.push(step('MP4', `${generate.count || 0} preparado(s), ${generate.reused || 0} reutilizado(s)`, generate.ok !== false));
  }
  if (sequence) {
    entry.steps.push(step('Secuencia', `${(sequence.files || []).length || sequence.count || 0} archivo(s) finales`, sequence.ok !== false));
    entry.files = sequence.files || [];
    entry.omitted = sequence.omitted || [];
  }
  if (upload) {
    entry.steps.push(step('FTP', upload.ok === false
      ? (upload.error || 'Fallo al subir')
      : `${(upload.files || []).length} archivo(s) subido(s) a ${upload.remoteDir || '/'}`,
    upload.ok !== false));
    if (!entry.files.length) entry.files = upload.files || [];
  }
  if (skipped) {
    entry.steps.push(step('Decisión', 'Sin cambios: se conservan los MP4 y no se sube al FTP', true));
  }
  if (busy) {
    entry.steps.push(step('Bloqueo', `No se inicia: ya trabaja ${busy.owner || 'otra operación'}`, false));
  }
  if (failed && failed.error) {
    entry.steps.push(step('Error', failed.error, false));
  }

  if (entry.status === 'skipped') {
    entry.headline = 'Sin cambios';
    entry.summary = 'Se actualizaron/comprobaron datos, pero la secuencia final era igual. No se regeneró ni se subió.';
  } else if (entry.status === 'error') {
    entry.headline = 'Error';
    entry.summary = failed.error || 'La operación terminó con fallos.';
  } else if (upload && upload.ok !== false) {
    entry.headline = 'Subida OK';
    entry.summary = `${(upload.files || []).length} archivo(s) enviados al FTP.`;
  } else if (generate && generate.ok !== false) {
    entry.headline = 'Preparación OK';
    entry.summary = `${generate.count || 0} MP4 preparados para revisar.`;
  } else {
    entry.headline = 'En curso';
    entry.summary = 'La operación sigue trabajando.';
  }

  return entry;
}

function fallbackFromStatus() {
  const st = status.read();
  const stages = st.stages || {};
  const entries = [];
  if (stages.upload || stages.generate || stages.sequence) {
    const up = stages.upload || {};
    const gen = stages.generate || {};
    const seq = stages.sequence || {};
    entries.push({
      id: 'status-fallback',
      ts: up.ts || seq.ts || gen.ts,
      finishedAt: up.ts || seq.ts || gen.ts,
      title: up.dryRun ? 'Comprobación registrada' : 'Última operación registrada',
      source: sourceLabel(up.source || 'manual'),
      status: up.ok === false || gen.ok === false || seq.ok === false ? 'error' : 'ok',
      headline: up.ok === false ? 'Fallo registrado' : (up.dryRun ? 'Comprobación OK' : 'Último estado OK'),
      summary: up.files ? `${up.files.length} archivo(s): ${(up.files || []).join(', ')}` : 'Actividad anterior a la versión de registro detallado.',
      steps: [
        gen.ts ? step('MP4', `${gen.count || 0} preparado(s), ${gen.reused || 0} reutilizado(s)`, gen.ok !== false) : null,
        seq.ts ? step('Secuencia', `${(seq.files || []).length || seq.count || 0} archivo(s) finales`, seq.ok !== false) : null,
        up.ts ? step('FTP', up.ok === false ? (up.error || 'Fallo') : `${(up.files || []).length || 0} archivo(s) ${up.dryRun ? 'simulado(s)' : 'subido(s)'}`, up.ok !== false) : null,
      ].filter(Boolean),
      files: up.files || seq.files || [],
      omitted: seq.omitted || [],
    });
  }
  return entries;
}

function list(limit = 20) {
  const events = auditLog.tail(500).filter((e) =>
    e && e.ts && e.type && !(!e.runId && e.type === 'publish.rundown')
  );
  const groups = new Map();
  for (const e of events) {
    const key = e.runId || `${e.type}-${e.ts}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(e);
  }
  const entries = Array.from(groups.values())
    .map((evs) => evs.sort((a, b) => String(a.ts).localeCompare(String(b.ts))))
    .map(summarizeGroup)
    .sort((a, b) => String(b.ts).localeCompare(String(a.ts)));
  const out = entries.length ? entries : fallbackFromStatus();
  return out.slice(0, limit);
}

module.exports = { list };
