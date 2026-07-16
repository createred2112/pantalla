'use strict';
// Registro de plantillas. Añadir una nueva = crear su archivo y listarlo aquí.
//
// VERSIONES DE DISEÑO: existe un set alternativo en ./v2 (letras GIGANTES).
// Se activa con config.design.version = 'v2' (Ajustes o `npm run design:v2`)
// y se puede volver a 'v1' en cualquier momento sin perder nada (rollback).
const lib = require('./_lib');
const { cfg } = require('../../config');

const modules = [
  require('./noticia'),
  require('./titular'),
  require('./dato'),
  require('./datocurioso'),
  require('./aire'),
  require('./luz'),
  require('./gasolina'),
  require('./alerta'),
  require('./meteoaviso'),
  require('./evento'),
  require('./cita'),
  require('./clima'),
  require('./prevision'),
  require('./foto'),
  require('./agenda'),
  require('./mensaje'),
];

// Overrides v2: mismo id, distinto diseño. Si una plantilla no tiene versión
// v2, se usa la v1 (nunca desaparece una plantilla al cambiar de versión).
const v2ById = new Map();
for (const m of modules) {
  try {
    const alt = require(`./v2/${m.id}`);
    if (alt && alt.id === m.id && typeof alt.build === 'function') v2ById.set(m.id, alt);
  } catch { /* sin versión v2: se usa la v1 */ }
}

const v1ById = new Map(modules.map((m) => [m.id, m]));

// Versión de diseño activa (leída en caliente: cambiarla no requiere reinicio).
function designVersion() {
  return cfg.design && cfg.design.version === 'v2' ? 'v2' : 'v1';
}

function activeModules() {
  if (designVersion() !== 'v2') return modules;
  return modules.map((m) => v2ById.get(m.id) || m);
}

function builtinGet(id) {
  const v2 = designVersion() === 'v2';
  const base = v1ById.get(id) || v1ById.get('noticia');
  return v2 ? (v2ById.get(base.id) || base) : base;
}

// Plantillas PROPIAS del usuario (guardadas desde el editor visual): se
// comportan como la plantilla base pero con su composición congelada dentro.
function userModule(rec) {
  const base = builtinGet(rec.base);
  return {
    ...base,
    id: rec.id,
    label: '★ ' + rec.label,
    defaultTheme: rec.theme || base.defaultTheme || null,
    userLayout: rec.layout,
    userBase: rec.base,
  };
}

function userModules() {
  try { return require('../../userTemplates').list().map(userModule); } catch { return []; }
}

function get(id) {
  if (String(id || '').startsWith('u_')) {
    try {
      const rec = require('../../userTemplates').get(id);
      if (rec) return userModule(rec);
    } catch { /* cae a la de serie */ }
  }
  return builtinGet(id);
}

// Lista para el panel (id, etiqueta, pistas de campos).
function list() {
  return [...activeModules(), ...userModules()].map((m) => ({ id: m.id, label: m.label, hint: m.hint || {}, logo: m.logo !== false, defaultTheme: m.defaultTheme || null, user: String(m.id).startsWith('u_') || undefined }));
}

module.exports = { get, list, lib, designVersion };
