'use strict';
// QA del AUTO-AJUSTE (F3): el bug real "miniatura bien / MP4 en marquesina".
// El script de auto-ajuste corre dos veces (al cargar el HTML y tras cargar
// las fuentes). Si la primera pasada mide con la fuente de reserva y dictamina
// un desborde FALSO, la segunda debe corregirlo del todo: sin marca de
// desborde pegada, sin line-clamp fantasma. Aquí se envenena a propósito el
// estado (como haría una primera pasada mala) y se exige la autocorrección.
const assert = require('assert');
const { buildHtml, withPage, AUTOFIT, close } = require('../src/generator/htmlRender');
const templates = require('../src/generator/templates');
const { cfg } = require('../src/config');

const card = {
  id: 'qa_autofit', type: 'generated', template: 'mensaje', theme: 'rojo',
  title: 'El Sacamantecas, la película rodada en Vitoria, ya tiene cartel y fecha de estreno',
  subtitle: 'ÚLTIMA HORA',
};

(async () => {
  const tpl = templates.get(card.template);
  const themeKey = card.theme;
  const W = cfg.screen.width || 1920, H = cfg.screen.height || 1080;
  const ctx = {
    W, H,
    theme: { key: themeKey, ...(cfg.palette[themeKey] || {}) },
    font: (cfg.brand && cfg.brand.fontFamily) || 'Oswald',
    fontDisplay: (cfg.brand && cfg.brand.fontDisplay) || 'Anton',
  };
  const html = await buildHtml(card, ctx, tpl, null);

  const result = await withPage(async (page) => {
    await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: 'load' });
    try { await page.evaluate('document.fonts.ready'); } catch {}
    // VENENO: simular que la primera pasada (fuente sin cargar) dictaminó
    // desborde y dejó el texto en modo recorte.
    await page.evaluate(() => {
      const el = document.querySelector('[data-fit]');
      el.dataset.overflow = '1';
      el.dataset.clamped = '1';
      el.style.whiteSpace = 'normal';
      el.style.display = '-webkit-box';
      el.style.webkitBoxOrient = 'vertical';
      el.style.webkitLineClamp = '1';
      el.style.overflow = 'hidden';
    });
    // La pasada definitiva (la que ejecutan tanto el JPG como el vídeo):
    await page.evaluate(AUTOFIT);
    return page.evaluate(() => {
      const el = document.querySelector('[data-fit]');
      const style = getComputedStyle(el);
      return {
        overflow: el.dataset.overflow || null,
        clamp: el.style.webkitLineClamp || null,
        lines: Math.round(el.scrollHeight / (parseFloat(style.lineHeight) || 1)),
        fits: el.scrollWidth <= el.parentElement.clientWidth + 1
          && el.scrollHeight <= el.parentElement.clientHeight + 1,
      };
    });
  });

  assert.strictEqual(result.overflow, null, 'la marca de desborde falsa debe limpiarse (si no, el vídeo saca marquesina)');
  assert.strictEqual(result.clamp, null, 'el line-clamp fantasma debe limpiarse');
  assert(result.fits, 'el titular largo debe caber tras el auto-ajuste');
  assert(result.lines >= 2, 'un titular largo debe partirse en varias líneas, no quedar en una');
  console.log(`OK: auto-ajuste autocorrectivo (${result.lines} líneas, sin desborde fantasma)`);
  await close();
})().catch(async (e) => { console.error(e.stack || e.message); try { await close(); } catch {} process.exit(1); });
