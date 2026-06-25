'use strict';
// Convierte un texto en slug seguro para nombre de archivo.
function slugify(text, fallback = 'cartela') {
  const s = String(text || '')
    .normalize('NFD').replace(/\p{Diacritic}/gu, '') // quita acentos
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return s || fallback;
}
module.exports = { slugify };
