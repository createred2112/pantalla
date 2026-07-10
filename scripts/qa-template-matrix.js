'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const templates = require('../src/generator/templates');
const renderer = require('../src/generator/renderCard');
const { cfg, paths } = require('../src/config');

const MARK = {
  title: 'MARCA TITULO 9381',
  subtitle: 'MARCA SUBTITULO 9381',
  body: 'MARCA CUERPO 9381',
  date: 'MARCA FECHA 9381',
};

function dataFor(template) {
  if (template === 'clima') return { max: 28, min: 14, isDay: true };
  if (template === 'gasolina') return {
    stations: [
      { g95: 1.429, name: 'ESTACION QA UNO', addr: 'CALLE PRUEBA 1' },
      { g95: 1.459, name: 'ESTACION QA DOS', addr: 'AVENIDA PRUEBA 2' },
    ],
  };
  if (template === 'luz') return {
    now: { v: 12.4 }, cheap: { h: 3, v: 7.1 }, exp: { h: 21, v: 28.6 },
  };
  if (template === 'prevision') return {
    days: [
      { label: 'HOY', cond: 'soleado', max: 28, min: 14 },
      { label: 'MANANA', cond: 'lluvia', max: 22, min: 12 },
      { label: 'PASADO', cond: 'nublado', max: 24, min: 13 },
    ],
  };
  return null;
}

function cardFor(template, theme) {
  const card = {
    id: `qa-${template}-${theme}`,
    type: 'generated',
    template,
    theme,
    ...MARK,
    data: dataFor(template),
  };
  if (template === 'agenda') card.body = `2026-07-10 | 19:30 | ${MARK.body} | LUGAR QA`;
  return card;
}

function textOf(frame) {
  return (frame.elements || []).map((el) => String(el.text || '')).join('\n').toUpperCase();
}

function assertContains(frame, value, label) {
  assert(textOf(frame).includes(String(value).toUpperCase()), `${label}: falta "${value}"`);
}

function stripLegacyMetadata(frame) {
  const background = frame.background ? { ...frame.background } : undefined;
  if (background) delete background.colorTheme;
  return {
    background,
    elements: (frame.elements || []).map((source) => {
      const el = { ...source };
      delete el.bind;
      delete el.transform;
      delete el.colorTheme;
      delete el.bgTheme;
      delete el.src;
      return el;
    }),
  };
}

function staticAudit() {
  const themes = Object.keys(cfg.palette || {});
  const list = templates.list();
  const clima = templates.get('clima');
  assert.strictEqual(clima.keyForCard({ subtitle: 'Despejado', data: { isDay: false } }), 'luna', 'clima: despejado nocturno debe usar luna');
  assert.strictEqual(clima.keyForCard({ subtitle: 'Poco nuboso', data: { isDay: false } }), 'lunanube', 'clima: nubes nocturnas deben usar luna y nube');
  assert.strictEqual(clima.keyForCard({ subtitle: 'Despejado', data: { isDay: true } }), 'sol', 'clima: despejado diurno debe usar sol');
  const assertExpectedFields = (tpl, frame, label) => {
    if (!['gasolina', 'prevision'].includes(tpl.id)) assertContains(frame, MARK.title, label);
    if (tpl.hint.subtitle !== '—') assertContains(frame, MARK.subtitle, label);
    if (tpl.hint.body !== '—') assertContains(frame, MARK.body, label);
    if (tpl.hint.date !== '—') assertContains(frame, MARK.date, label);
  };
  for (const tpl of list) {
    for (const theme of themes) {
      const card = cardFor(tpl.id, theme);
      const frame = renderer.resolveForEditor(card);
      assert(frame && frame.elements && frame.elements.length, `${tpl.id}/${theme}: frame vacio`);
      assertExpectedFields(tpl, frame, `${tpl.id}/${theme}`);
    }

    const oldCard = {
      ...cardFor(tpl.id, 'blanco'),
      title: 'TEXTO ANTIGUO', subtitle: '', body: '', date: '',
    };
    if (tpl.id === 'agenda') oldCard.body = '2026-07-10 | 10:00 | EVENTO ANTIGUO | LUGAR ANTIGUO';
    const legacy = stripLegacyMetadata(renderer.resolveForEditor(oldCard));
    const migrated = renderer.resolveForEditor({ ...cardFor(tpl.id, 'azul'), layout: legacy });
    assertExpectedFields(tpl, migrated, `${tpl.id}/layout antiguo`);
  }

  const oldMeteo = renderer.resolveForEditor({
    ...cardFor('meteoaviso', 'blanco'),
    title: 'TEXTO ANTIGUO', subtitle: '', body: 'CUERPO ANTIGUO', date: 'FUENTE ANTIGUA',
  });
  const fixedMeteo = renderer.resolveForEditor({
    ...cardFor('meteoaviso', 'azul'),
    layout: stripLegacyMetadata(oldMeteo),
  });
  assertContains(fixedMeteo, MARK.subtitle, 'meteoaviso/layout antiguo');
  assertContains(fixedMeteo, MARK.body, 'meteoaviso/layout antiguo');
  assert.strictEqual(fixedMeteo.background.color.toLowerCase(), cfg.palette.azul.bg.toLowerCase(), 'meteoaviso: el fondo antiguo no siguio la paleta');

  const oldAgenda = renderer.resolveForEditor({
    ...cardFor('agenda', 'blanco'),
    body: '2026-07-10 | 10:00 | EVENTO ANTIGUO | LUGAR ANTIGUO',
  });
  const fixedAgenda = renderer.resolveForEditor({
    ...cardFor('agenda', 'carbon'),
    layout: stripLegacyMetadata(oldAgenda),
  });
  assertContains(fixedAgenda, MARK.body, 'agenda/layout antiguo');
  assert(!textOf(fixedAgenda).includes('EVENTO ANTIGUO'), 'agenda: el layout congelo el evento anterior');
  assert.strictEqual(fixedAgenda.background.color.toLowerCase(), cfg.palette.carbon.bg.toLowerCase(), 'agenda: no respeto la paleta');

  const weatherCard = {
    ...cardFor('clima', 'carbon'),
    subtitle: 'Nublado',
    body: 'Max 33o - Min 20o',
  };
  const weatherBase = renderer.resolveForEditor(weatherCard);
  const weatherLayout = JSON.parse(JSON.stringify({ background: weatherBase.background, elements: weatherBase.elements }));
  const weatherText = weatherLayout.elements.find((el) => el.type === 'text' && el.bind === 'weatherSummary');
  const weatherBand = weatherLayout.elements.find((el) =>
    (el.type === 'rect' || el.type === 'band') && Number(el.y || 0) > weatherBase.H * 0.5 && Number(el.y || 0) < weatherBase.H * 0.85
  );
  assert(weatherText && weatherBand, 'clima: no se localizaron la franja y su texto');
  weatherText.color = '#000000';
  weatherText.colorFixed = true;
  delete weatherText.colorTheme;
  weatherBand.color = '#CCFF22';
  weatherBand.colorFixed = true;
  delete weatherBand.colorTheme;
  const fixedWeather = renderer.resolveForEditor({ ...weatherCard, layout: weatherLayout });
  const fixedWeatherText = fixedWeather.elements.find((el) => el.type === 'text' && el.bind === 'weatherSummary');
  const fixedWeatherBand = fixedWeather.elements.find((el) => el.id === weatherBand.id);
  assert.strictEqual(fixedWeatherText.color.toLowerCase(), '#000000', 'clima: se perdio el color fijo del texto de la franja');
  assert.strictEqual(fixedWeatherBand.color.toLowerCase(), '#ccff22', 'clima: se perdio el color fijo de la franja');

  return { templates: list.length, themes: themes.length, combinations: list.length * themes.length };
}

function labelSvg(label, width, height) {
  const safe = String(label).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#07162a"/><text x="10" y="17" fill="#ffffff" font-family="Arial" font-size="14" font-weight="700">${safe}</text></svg>`);
}

async function renderMatrix() {
  const out = path.join(paths.output, 'qa-template-matrix');
  fs.mkdirSync(out, { recursive: true });
  const cellW = 320, imageH = 180, labelH = 22, cellH = imageH + labelH, cols = 4;
  for (const theme of Object.keys(cfg.palette || {})) {
    const cells = [];
    for (const tpl of templates.list()) {
      const result = await renderer.renderToBuffer(cardFor(tpl.id, theme));
      const thumb = await sharp(result.buffer).resize(cellW, imageH, { fit: 'fill' }).png().toBuffer();
      const cell = await sharp({ create: { width: cellW, height: cellH, channels: 3, background: '#07162a' } })
        .composite([{ input: thumb, top: 0, left: 0 }, { input: labelSvg(tpl.id, cellW, labelH), top: imageH, left: 0 }])
        .png().toBuffer();
      cells.push(cell);
    }
    const rows = Math.ceil(cells.length / cols);
    const sheet = sharp({ create: { width: cellW * cols, height: cellH * rows, channels: 3, background: '#07162a' } });
    await sheet.composite(cells.map((input, i) => ({ input, left: (i % cols) * cellW, top: Math.floor(i / cols) * cellH })))
      .png().toFile(path.join(out, `${theme}.png`));
  }
  return out;
}

(async () => {
  const result = staticAudit();
  console.log(`OK: ${result.templates} plantillas x ${result.themes} paletas = ${result.combinations} combinaciones`);
  if (process.argv.includes('--render')) console.log(`Matriz visual: ${await renderMatrix()}`);
})().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
