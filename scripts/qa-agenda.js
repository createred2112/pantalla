'use strict';

const assert = require('assert');
const { normalizeKulturklikEvent } = require('../src/suggestions');
const agenda = require('../src/generator/templates/v2/agenda');

const exhibition = normalizeKulturklikEvent({
  nameEs: '"Mirar el agua", exposición de Cristina Souto Pita',
  typeEs: 'Exposición',
  openingHoursEs: 'De lunes a domingo: 11:00-14:00 y 18:00-21:00',
  establishmentEs: 'Centro Cultural Montehermoso',
});
assert.strictEqual(exhibition.time, '', 'una hora de apertura no puede fingir ser el inicio de una exposición');
assert.strictEqual(exhibition.type, 'Exposición');
assert(exhibition.title.startsWith('"Mirar el agua"'), 'las comillas del título deben quedar equilibradas');

const concert = normalizeKulturklikEvent({
  nameEs: 'Concierto de prueba',
  typeEs: 'Concierto',
  openingHoursEs: '21:30',
  establishmentEs: 'Teatro Principal',
});
assert.strictEqual(concert.time, '21:30', 'un concierto sí debe conservar su hora de inicio');

const longTitle = 'Naturaleza y cultura: las montañas como fuente de inspiración para una exposición extraordinariamente larga';
const longVenue = 'Ataria - Centro de interpretación de los humedales de Salburua';
const card = {
  title: 'Agenda',
  subtitle: 'Hoy',
  body: `EXPO | ${longTitle} | ${longVenue}\n21:30 | Concierto de verano en la Plaza Nueva | Plaza Nueva\n | Mercado de la Almendra | Casco Viejo`,
};

const scenes = agenda.videoScenes(card);
assert.strictEqual(scenes.length, 3, 'cada evento debe convertirse en una escena del mismo vídeo');
assert(scenes.every((scene) => scene.body.split(/\r?\n/).length === 1), 'cada escena debe contener un solo evento');

const frame = agenda.build(scenes[0], {
  W: 1920,
  H: 1080,
  theme: { accent: '#ef2b2d', accentText: '#fff', bg: '#f4f3ef', text: '#111', textMuted: '#777' },
  brand: { website: 'GasteizBerri.com' },
});
const textElements = frame.elements.filter((el) => el.type === 'text');
const signal = textElements.find((el) => el.text === 'EXPO');
assert(signal, 'una exposición sin hora debe tener un rótulo EXPO visible');
assert(signal.autofit.min >= 108, 'EXPO no puede bajar del 10% del alto de pantalla');
const signalRect = frame.elements
  .filter((el) => el.type === 'rect' && String(el.color || '').toUpperCase() === '#5537B8')
  .sort((a, b) => b.h - a.h)[0];
const eventNames = textElements.filter((el) => String(el.text || '').startsWith('NATURALEZA Y CULTURA'));
assert.strictEqual(eventNames.length, 1, 'un frame no puede volver a apilar varios eventos');
assert(eventNames[0].autofit.min >= 97 && eventNames[0].autofit.lines === 2, 'el titular debe ser gigante y admitir dos líneas');
const venue = textElements.find((el) => String(el.text || '').startsWith('ATARIA'));
assert(venue && venue.autofit.min >= 66, 'el lugar debe seguir siendo legible en el panel LED');
assert(signalRect && signalRect.y === eventNames[0].y, 'la caja EXPO/HORA debe empezar en la misma horizontal que el titular');
assert(Math.abs((signalRect.y + signalRect.h) - (venue.y + venue.h)) <= 1, 'la caja EXPO/HORA debe terminar en la misma horizontal que el lugar');
assert(!textElements.some((el) => String(el.text || '').includes('CONCIERTO DE VERANO')), 'la primera escena no debe mezclar el segundo evento');

const generic = agenda.parseAgendaLine('Mercado de la Almendra | Casco Viejo');
assert.strictEqual(generic.signal, 'EVENTO', 'un evento manual sin hora necesita igualmente un rótulo grande');
assert.strictEqual(generic.venue, 'CASCO VIEJO');

console.log('OK: Agenda LED usa una escena por evento, HORA/EXPO gigantes y conserva el tipo de Kulturklik');

if (process.argv.includes('--render')) {
  const fs = require('fs');
  const path = require('path');
  const sharp = require('sharp');
  const { renderToBuffer } = require('../src/generator/renderCard');
  const output = path.join(__dirname, '..', 'output');
  const high = path.join(output, 'qa-agenda-led.jpg');
  const led = path.join(output, 'qa-agenda-led-300x169.png');
  renderToBuffer({
    id: 'qa-agenda-led', type: 'generated', template: 'agenda', theme: 'blanco',
    title: 'AGENDA', subtitle: 'HOY', body: scenes[0].body,
    _agendaSceneIndex: 0, _agendaSceneCount: scenes.length,
  }).then(async ({ buffer }) => {
    fs.mkdirSync(output, { recursive: true });
    fs.writeFileSync(high, buffer);
    await sharp(buffer).resize(300, 169, { fit: 'fill', kernel: 'nearest' }).png().toFile(led);
    console.log(`Muestra HD: ${high}`);
    console.log(`Simulación LED 300x169: ${led}`);
  }).catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
