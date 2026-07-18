# Changelog

Cambios relevantes desde la serie 0.100. Se agrupan por entregas de producto;
las correcciones pequeñas intermedias quedan en el historial Git.

## 0.153.0 — Tanda visual y cierre seguro

- La portada pasa a ser la tanda: ocho huecos numerados, con miniatura real,
  estado y acciones directas para editar o sustituir.
- Sustitución visual sin desplegables; las cartelas reutilizables quedan en una
  zona separada, desaturada y marcada como **NO ACTIVA**.
- Asistente de una sola vista: conserva los ocho huecos actuales, permite
  reordenar y resuelve Agenda, varias fotos y rotaciones en el propio hueco.
- Comprobación previa atómica: si Agenda o Fotos están vacías se detiene antes
  de renderizar y no altera ni la tanda guardada ni la pantalla.
- Agenda acepta tanto `19:30 Título | Lugar` como `19:30 | Título | Lugar`, y
  su texto principal usa una familia más abierta y legible.
- Los estados operativos se desplazan debajo de la tanda para que no separen
  las acciones de sus cartelas.

## 0.152.0 — Candidata F4

- Panel y editor adaptados al iPhone real en vertical y horizontal.
- Los diálogos reaccionan a la altura del teclado; cabecera y botones no se
  pierden fuera de pantalla.
- Agenda protegida frente a listas largas de sugerencias.
- Pruebas móviles automáticas para Agenda, asistente y editor táctil.
- Cierre coordinado de Chromium: una petición tardía ya no puede cruzarse con
  una captura activa ni filtrar promesas rechazadas al proceso.

## 0.151.0 — Simplificación

- Diseño GIGANTE como única vía activa; retirados v1 y su conmutador.
- Retiradas por completo las paletas y combinaciones de color: 16 plantillas,
  16 estilos únicos.
- Asistente de próxima tanda que parte de las ocho posiciones actuales,
  conserva borrador y permite corregir cualquier posición.
- Carruseles con pieza actual/siguiente y fuentes automáticas comprobables.
- Agenda LED rehecha: una escena por evento, `HORA`/`EXPO` gigantes, alineación
  estricta y conservación del tipo recibido desde Kulturklik.
- Eliminados endpoints y código sin consumidor; textos visibles sin jerga
  interna conocida.

## 0.150.0 — Red de seguridad y entrega

- `npm test` con unitarias, backup, humo end-to-end y comparación visual.
- Assets con huella de contenido y aviso **Actualizar** para PWA/Safari.
- Deploy con versión y healthcheck verificables; rollback en un comando.
- Backup diario de `data/` y `config/`, retención de 14 días y restauración
  probada.
- Publicación protegida: ocho MP4 o ningún cambio en la pantalla.

## 0.149.x — Contenido y uso móvil

- Agenda desde Kulturklik, caché diaria y agenda de mañana.
- Fotos de WordPress y cartela Foto GasteizBerri con rotación.
- Conversión directa de una cartela entre manual, automática y carrusel.
- Safe areas de iOS, botoneras visibles y refresco inmediato de plantillas ★.
- Correcciones de legibilidad en gasolina, previsión, fotos y fuentes.

## 0.140–0.143 — Diseño y editor

- Diseño GIGANTE para la baja resolución efectiva del panel LED.
- Editor visual rediseñado con capas, guías, deshacer, tamaños y manejo táctil.
- Plantillas propias ★ y edición directa desde la cartela.

## 0.100–0.139 — Operación diaria

- Contrato de ocho archivos fijos, emisión atómica y archivos anteriores.
- Piloto de emisión, datos automáticos, carruseles y programación por días.
- Caché de vídeos por contenido y progreso de generación/subida.
- Historial operativo, vista previa de la vuelta y separación entre preparar y
  publicar.
- Controles de seguridad: memoria, bloqueos de operación, rutas y reintentos.
