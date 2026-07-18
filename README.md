# LA PANTALLA — motor de cartelería digital (gasteizberri)

Motor en Node.js que:

1. **Genera** MP4 con texto + foto variables (plantillas ampliables).
2. **Importa** JPGs/MP4s que deja otro worker (el de codex) en `data/worker-inbox/`.
3. **Secuencia y renombra** las cartelas activas a `publish/` como ocho vídeos fijos:
   `berri-1.mp4` ... `berri-8.mp4`. Si no hay ocho piezas válidas, no se toca `publish/`.
4. **Sube por FTP** el contenido de `publish/`, sobreescribiendo lo anterior.
5. **Panel móvil** de admin para editar noticias y subir fotos desde la calle.
6. **Logs** (`logs/pantalla.log`, JSON-lines) y **status** (`logs/status.json`).

## Pipeline

```
import  →  generate  →  sequence  →  upload
(worker)  (JPG texto)   (NN_slug)    (FTP overwrite)
```

## Puesta en marcha (local)

```bash
cd pantalla
npm install
cp .env.example .env     # rellena FTP_* y PORT
npm run demo             # crea 2 cartelas de ejemplo y hace un dry-run
npm start                # arranca el panel en http://localhost:8080
```

El panel es **móvil-first**: añadir/editar/ordenar cartelas, subir foto con la
cámara, previsualizar el vídeo en vivo, y botón **Publicar** (con modo "Probar"
que no sube nada).

## Contrato de pantalla en producción

La pantalla espera **exactamente ocho MP4** y siempre con los mismos nombres:
`berri-1.mp4`, `berri-2.mp4`, `berri-3.mp4`, `berri-4.mp4`, `berri-5.mp4`,
`berri-6.mp4`, `berri-7.mp4`, `berri-8.mp4`.

El sistema fuerza la salida a MP4, no sube `playlist.json` y no limpia la carpeta
remota antes de subir. La etapa `sequence` valida la tanda completa antes de
tocar `publish/`: con menos de ocho cartelas activas o con algún archivo que no
sea MP4, la publicación se detiene y el FTP no recibe una tanda parcial.

Los MP4 generados se cachean por firma de contenido: textos, datos, plantilla,
tema, diseño, duración, marca, resolución y cortinillas. Si nada cambia, la
vista previa y la publicación reutilizan el mismo archivo; si cambia una sola
cartela, solo se regenera esa pieza.

En **Ajustes → Cortinillas por plantilla** se pueden subir entradas y salidas
MP4 por tipo de cartela (`clima`, `luz`, `agenda`, etc.). El resultado final de
cada posición sigue siendo un único `berri-N.mp4`, con intro + cartela + outro
unidos en el mismo archivo.

En los **bancos de contenido** de la Escaleta (datos útiles, citas, datos
curiosos, efemérides…), la plantilla elegida EN CADA PIEZA manda: el banco solo
decide la plantilla cuando la pieza no trae una propia. (Antes el banco la
machacaba en silencio y ninguna pieza salía con la plantilla elegida.)

La **Agenda viva** permite programar piezas por momento: una pieza puede salir
desde ahora, desaparecer a una hora concreta o quedar preparada para mañana a
una hora exacta. Así un concierto de las 21:00 deja de verse a las 22:00 y se
puede dejar preparado otro mensaje para mañana sin tocar la pantalla a última
hora.

### Crear una cartela desde una URL

En el editor, pega una URL (noticia de WordPress o cualquier web con Open Graph
/ JSON-LD) y pulsa **Extraer**: la herramienta rellena **título, subtítulo,
texto, fecha y foto** automáticamente. Después puedes:

- **Probar plantillas visualmente**: la galería muestra una miniatura de cada
  plantilla renderizada con tus datos; toca una para elegirla.
- **Ajustar el detalle**: cambia textos, foto y duración antes de guardar. Cada
  plantilla tiene un único estilo cromático estable; si quieres retocarlo,
  hazlo una vez desde el editor visual de esa plantilla.

## Acceso de administradores

El panel está **protegido**: sin sesión, toda navegación redirige a `/login` y
la API responde `401`. Crea administradores desde el servidor:

```bash
npm run admin:add -- usuario contraseña   # crea un admin
npm run admin:list                         # lista admins
npm run admin:remove -- usuario            # elimina un admin
```

- Contraseñas con **scrypt** (nunca se guardan en claro) en `config/admins.json` (gitignored).
- Sesión por **cookie HttpOnly firmada con HMAC** (7 días); `Secure` automático bajo HTTPS.
- **Throttling**: 5 intentos fallidos bloquean esa IP 5 minutos.
- `PANEL_TOKEN` (opcional, en `.env`) permite acceso de **máquinas** a `/api/*`
  con la cabecera `x-panel-token` —pensado para automatizaciones (cron, worker)—,
  no para personas.

## CLI

```bash
node src/cli.js import            # registra lo que dejó el worker
node src/cli.js generate          # renderiza los MP4
node src/cli.js sequence          # ordena + renombra los 8 MP4 a publish/
node src/cli.js upload            # sube por FTP (dry-run si no hay credenciales)
node src/cli.js publish           # pipeline completo
node src/cli.js publish --dry-run # todo menos la subida real
```

## Temas de color (diseño BOLD, editable)

Los colores NO están dentro de las plantillas: viven en `config/pantalla.config.json`
bajo `palette`. Cambiar ahí un tema restila TODAS las cartelas que lo usan. Cada
tema define `bg`, `bg2` (degradado), `text`, `textMuted`, `accent` y `accentText`.

Paleta CERRADA del Display System: **carbon** `#0E0E0E`, **blanco** roto `#F2F1ED`,
**lima** `#D6FF00`, **rojo** `#FF2D2D`, **azul** `#0066FF`, gris `#BEBEBE`.
Temas: `azul, rojo, lima, carbon, blanco`. Fondos PLANOS, tipografía pesada en
MAYÚSCULAS, 2-5 palabras. Cada plantilla trae un tema por defecto, y cada cartela
puede **forzar otro** con `theme` (en el panel: selector + muestras de color).

El logo es el **wordmark "GasteizBerri"** (texto), color según tema.

### Tipografía (empaquetada, no depende del sistema)

Las fuentes viven en `assets/fonts/` (TTF libres) y se activan vía fontconfig:
`config.js` genera `assets/fonts/fonts.conf` y exporta `FONTCONFIG_FILE` ANTES de
cargar sharp/librsvg. Así se ven igual en local y en el VPS sin instalar nada.

Sistema de **dos fuentes** (config `brand`):
- **`fontDisplay`** = **Anton** → titulares/cifras gigantes (ultra-bold display).
- **`fontFamily`** = **Oswald** → textos, etiquetas, horas, lugares, wordmark (condensada).

También está **Archivo** (400-900) empaquetada por si se quiere un look grotesco
de ancho normal. Cambiar de fuente = editar esas dos líneas de `config`. Para
añadir otra: deja el TTF en `assets/fonts/` y referénciala por su nombre de familia.

## Plantillas (diseño de impacto)

Filosofía: **cero palabras pequeñas, mínima info, máximo impacto, total comprensión.**
Cada plantilla agranda la tipografía hasta llenar el espacio disponible. Se elige
con el campo `template` y los campos `title / subtitle / body / date` se reinterpretan
según la plantilla (el panel muestra una pista por campo). El color lo pone el **tema**.

| Plantilla | Para qué | title | subtitle | body | date |
|---|---|---|---|---|---|
| `noticia`  | Informativa con foto | Titular | Sección (chip) | Entradilla | Fecha |
| `titular`  | Foto a sangre + frase ENORME | La frase | Sección (chip) | — | Fecha |
| `dato`     | Cifra gigante (aforos, %, ºC) | La cifra | Qué mide | Contexto | Actualizado |
| `datocurioso` | Frase breve/mediana con banda superior | El dato | Texto superior | Detalle | Fuente |
| `alerta`   | Avisos (tráfico, meteo) máx. contraste | El aviso | Tipo (AVISO…) | Detalle | Cuándo |
| `meteoaviso` | Aviso meteorológico / consejo | El mensaje | Etiqueta superior | Detalle/consejo | Vigencia |
| `evento`   | Evento con fecha protagonista | Nombre | Tipo (chip) | Lugar | Fecha/hora |
| `cita`     | Frase entrecomillada editorial | La frase | Autor | — | Fecha |
| `clima`    | Tiempo ahora + icono | Temperatura actual | Condición actual (define el icono) | Nota secundaria | Momento: AHORA |
| `prevision` | Tiempo 3 días (worker `forecast`) | (worker) | Etiqueta (chip) | — | Fuente |
| `aire`     | Calidad del aire (worker `airQuality`) | Estado (BUENA…) | Etiqueta | Peor indicador | Fuente |
| `luz`      | Precio de la luz (worker `powerPrice`) | Precio ahora | Etiqueta | Consejo | Fuente |
| `gasolina` | Estaciones más baratas (worker `fuel`) | (worker) | Etiqueta | — | Fuente |
| `foto`     | Foto a sangre, casi sin texto | Pie (opcional) | Etiqueta (chip) | — | Hora |
| `agenda`   | Lista del día con bandas (hasta 3) | Etiqueta banda | Periodo | `FECHA \| HORA \| Nombre \| Lugar` por línea | — |
| `mensaje`  | Lema/impacto a pantalla | El mensaje | Etiqueta | — | — |

> `clima` deduce el icono (sol, nube, lluvia, nieve, tormenta, niebla, viento)
> de la palabra escrita en el subtítulo: "Soleado", "Lluvia", "Nieve"…

Añadir una plantilla nueva: crear `src/generator/templates/mi-plantilla.js`
(exporta `{ id, label, hint, frame(card, ctx) }`) y listarla en
`src/generator/templates/index.js`. Las plantillas pueden usar foto a sangre o
fondo sólido/degradado, y colocar el logo en cualquier esquina (`logoPos`).

## Diseño de cartelas

El diseño **GIGANTE** es el único diseño del producto. Está pensado para
pantallas de poca resolución: ningún texto por debajo de ~5,5% del alto
(≈59 px a 1080p), etiquetas convertidas en bandas a sangre y titulares al
límite del lienzo. Sus implementaciones viven en
`src/generator/templates/v2/`; los módulos del directorio superior son bases
internas y respaldos, no una versión seleccionable.

- Diseños predeterminados: `data/template-layouts.v2.json`.
- Diseños propios: `data/user-templates.json`.
- Diseños por cartela: se guardan con `design: "v2"`.
- `data/template-layouts.json` y los diseños de cartela antiguos se conservan
  en disco como datos históricos, pero ya no se aplican.

`npm run qa:templates` audita los 16 estilos únicos, uno por plantilla; con
`--render` genera una sola hoja en `output/qa-template-matrix-v2/styles.png`.

## Configuración

- **`config/pantalla.config.json`** — resolución de pantalla, calidad, marca
  (logo/colores), esquema de renombrado (`fixedFiles`, `padStart`, `separator`, `prefixWithOrder`),
  rutas y opciones de FTP (`remoteDir`, `clearRemoteFirst`).
- **`.env`** — credenciales FTP, puerto del panel y token opcional.

## Modelo de cartela (card)

```jsonc
{
  "type": "generated",   // generated | image | video
  "order": 1,
  "enabled": true,
  "template": "noticia",
  "title": "Titular",
  "subtitle": "Sección",
  "body": "Cuerpo de la noticia",
  "photo": "data/uploads/up_123.jpg",  // fondo (solo generated)
  "file": "data/worker-inbox/x.mp4",   // archivo listo (image/video)
  "duration": 10,
  "source": "manual"     // manual | worker
}
```

## Pendiente de tus datos

- **Resolución real** de la pantalla (ahora 1920×1080).
- **Esquema exacto** de nombres que espera el reproductor (ahora `NN_slug.ext`).
- **Credenciales y carpeta FTP** de destino.
- Formato/carpeta de salida del **worker de codex**.

## Despliegue en VPS (CloudPanel) — resumen

1. Crear sitio Node.js en CloudPanel apuntando a esta carpeta, `npm install`.
2. Comando de arranque `node src/server.js` (o vía PM2).
3. Definir variables FTP y `SESSION_SECRET` en `.env`, y crear los administradores
   con `npm run admin:add -- usuario contraseña`.
4. Acceso al panel por HTTPS (CloudPanel gestiona el certificado): así la cookie
   de sesión viaja con flag `Secure`.
5. Para fuentes consistentes en el JPG, instalar en el VPS:
   `apt-get install -y fonts-liberation2` (Arial-compatible).
