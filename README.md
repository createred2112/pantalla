# LA PANTALLA

Motor de cartelería digital de GasteizBerri. Genera la programación de un panel
LED urbano, la presenta como una vuelta de ocho vídeos y la publica por FTP.
El panel de administración es una PWA móvil pensada para una sola persona.

Versión actual: **1.0.0**.

## Contrato de emisión

La pantalla recibe exactamente estos archivos:

```text
berri-1.mp4  berri-2.mp4  berri-3.mp4  berri-4.mp4
berri-5.mp4  berri-6.mp4  berri-7.mp4  berri-8.mp4
```

La secuencia se valida completa antes de tocar `publish/`. Si falta una pieza,
un archivo no es MP4 o una generación falla, no se sube una tanda parcial y la
pantalla conserva la última válida. La tanda anterior queda disponible para
restauración.

## Uso diario

El manual está dividido en cuatro páginas:

1. [Agenda del día](docs/manual/01-agenda.md)
2. [Preparar la próxima tanda](docs/manual/02-proxima-tanda.md)
3. [Retocar el estilo](docs/manual/03-retocar-estilo.md)
4. [Preparar, revisar y subir](docs/manual/04-publicar.md)

El panel separa deliberadamente las acciones:

- **Preparar archivos** genera o reutiliza los ocho MP4.
- **Vista previa** enseña la vuelta completa.
- **Subir** es la única acción que cambia la emisión real.

La portada enseña siempre los ocho huecos de la tanda actual. Cada hueco se
puede editar o sustituir visualmente sin empezar de cero; las cartelas
guardadas que no están en pantalla aparecen aparte y marcadas como
**NO ACTIVA**. Agenda, Fotos y las rotaciones se resuelven dentro de esa misma
vista.

## Puesta en marcha local

Requisitos: Node.js 22. Las fuentes y Chromium del render forman parte de las
dependencias del proyecto; no hay que instalar tipografías del sistema.

```bash
npm install
cp .env.example .env
npm start
```

Panel: `http://localhost:8080` salvo que `PORT` indique otro puerto.

Crear el primer administrador:

```bash
npm run admin:add -- usuario contraseña
npm run admin:list
```

Las contraseñas usan scrypt y nunca se guardan en claro. Las sesiones viajan en
cookie `HttpOnly`, con `Secure` automático bajo HTTPS. Cinco intentos fallidos
bloquean temporalmente la IP.

## Cómo se forma una tanda

```text
escaleta + bancos + datos automáticos
                 ↓
             8 cartelas
                 ↓
      generar o reutilizar MP4
                 ↓
       validar y numerar 1…8
                 ↓
       vista previa → subir FTP
```

- La **escaleta** decide las ocho posiciones y su orden.
- Los **bancos** guardan piezas reutilizables y su rotación.
- Los **datos automáticos** obtienen tiempo, previsión, aire, luz y combustible;
  cada fuente conserva última comprobación y último dato válido.
- `cards.json` es la vista materializada que usa el generador.
- Una cartela editada recuerda el cambio en el bloque que la produce.

Los vídeos se reutilizan por una firma de contenido: datos, plantilla, diseño,
duración, marca, resolución y entradas/salidas. Si cambia una sola cartela, solo
esa pieza necesita regenerarse.

## Agenda

Agenda exprés acepta un evento por línea:

```text
19:30 Concierto de jazz | Teatro Principal
19:30 | Concierto de jazz | Teatro Principal
EXPO Mirar el agua | Montehermoso
EXPO | Mirar el agua | Montehermoso
```

También ofrece sugerencias de Kulturklik. Una exposición sin hora conserva su
tipo `EXPO`; no recibe una hora inventada. En el vídeo, cada evento es una
escena independiente con hora/tipo, título y lugar a tamaño de panel LED.
Si no hay eventos activos, Agenda no inventa una cartela vacía: su posición
repite automáticamente el vídeo promo disponible (u otra pieza válida).

## Plantillas y editor

Hay 16 plantillas de serie, cada una con un único estilo cromático:

`noticia`, `titular`, `dato`, `datocurioso`, `aire`, `luz`, `gasolina`,
`alerta`, `meteoaviso`, `evento`, `cita`, `clima`, `prevision`, `foto`,
`agenda` y `mensaje`.

El diseño **GIGANTE** es la única vía activa. Está pensado para la baja
resolución efectiva del panel: información corta, tipografía grande y
contraste fuerte. Los módulos viven en `src/generator/templates/v2/`; los del
directorio superior aportan metadatos o compatibilidad interna, no una segunda
versión seleccionable.

Orden de resolución del diseño:

1. diseño propio de la cartela;
2. plantilla propia ★ o diseño predeterminado de la plantilla;
3. plantilla GIGANTE incluida en el código.

Los metadatos antiguos `design: "v2"` y `theme` se toleran al leer datos para
no romper históricos, pero no ofrecen otra vía de render ni una paleta
seleccionable.

Archivos:

- `data/template-layouts.v2.json`: diseños predeterminados;
- `data/user-templates.json`: plantillas propias ★;
- `data/cards.json`: cartelas materializadas;
- `data/rundown.json`: escaleta y bancos.

El editor visual funciona con ratón o táctil, en vertical y horizontal. Permite
mover/redimensionar, alinear, ocultar, cambiar tipografía/colores y deshacer.

## Fotos, URL y vídeos propios

Una cartela puede extraer título, texto, fecha y foto desde una URL con
WordPress, Open Graph o JSON-LD. El panel también puede usar fotos de la
mediateca de GasteizBerri, archivos subidos y vídeos MP4 ya terminados.

Las entradas y salidas MP4 opcionales se configuran por tipo de plantilla. El
resultado de cada posición sigue siendo un único `berri-N.mp4`.

## Archivos y configuración

- `config/pantalla.config.json`: pantalla, marca, FTP y opciones operativas.
- `.env`: secretos y sobrescrituras de entorno.
- `data/`: contenido editable y estado de producto.
- `output/`: render intermedio y caché de MP4.
- `publish/`: tanda validada que se puede subir.
- `publish-anterior/`: última tanda reemplazada.
- `logs/`: registro y estado operativo.
- `backups/`: copias diarias de datos/configuración.

Variables principales de `.env`:

```text
PORT=8080
SESSION_SECRET=...
FTP_HOST=...
FTP_PORT=21
FTP_USER=...
FTP_PASSWORD=...
FTP_SECURE=false
PANEL_TOKEN=...
```

La configuración guardada desde el panel tiene prioridad sobre las variables
FTP cuando contiene valores explícitos. `PANEL_TOKEN` es solo para procesos,
no sustituye el acceso de administradores.

## Comandos

```bash
npm start                         # panel
npm run generate                  # generar/reutilizar MP4
npm run sequence                  # validar y numerar los ocho archivos
npm run upload                    # subir; sin credenciales hace comprobación
npm run publish                   # ciclo completo
npm run demo                      # datos de demostración
npm run backup                    # copia manual
npm run backup:restore -- ARCHIVO # restauración protegida
```

## Red de seguridad

```bash
npm test
```

La cadena ejecuta:

- orden y contrato de escaleta;
- backup, desastre simulado, restauración y retención;
- candados de operación y reintento de alerta exclusiva;
- auditoría de las 16 plantillas;
- autoajuste tipográfico y Agenda LED;
- lenguaje visible sin jerga interna conocida;
- 17 flujos end-to-end en viewport de iPhone;
- comparación de píxeles de la matriz visual (umbral 0,1 %).

Las pruebas arrancan el servidor con `PANTALLA_QA=1`, anulan FTP y tareas de
fondo, fotografían `data/` y `config/` y los restauran al terminar.

Comandos específicos:

```bash
npm run qa:e2e
npm run qa:agenda
npm run qa:templates
npm run qa:templates:visual
npm run qa:visual:check
npm run qa:visual:baseline       # solo ante un cambio visual intencionado
npm run manual:capturas          # regenera las imágenes del manual
```

## PWA y actualizaciones

Los JS/CSS se referencian con huella de contenido desde HTML no cacheable. Si el
panel queda abierto durante un despliegue, compara su huella al volver a primer
plano y muestra **Actualizar**. No hace falta borrar caché ni reinstalar la PWA.

El panel respeta safe areas, objetivos táctiles de 44 px, teclado sobre diálogos
y las dos orientaciones del iPhone.

## Backup, despliegue y rollback

El servidor crea un backup diario de `data/` y `config/`, conserva 14 días y no
incluye cachés ni el histórico de emisiones.

```bash
bash scripts/update-server.sh               # actualizar y verificar
bash scripts/update-server.sh --healthcheck # comprobar sin desplegar
bash scripts/update-server.sh --rollback    # volver al despliegue anterior
```

El script espera a que vuelva el proceso y exige HTTP 200, versión correcta,
huella de assets y páginas esenciales. Un fallo termina con código distinto de
cero.

Para incidencias, seguir [el runbook de diez pasos](docs/RUNBOOK.md).

## Estado de la versión 1.0

- F0: diagnóstico — cerrado.
- F1: red de seguridad — cerrada.
- F2: entrega, caché, backup y rollback — cerrada.
- F3: simplificación — cerrada.
- F4: recorridos y ergonomía móvil — cerrada y probada en iPhone.
- F5: batería final verde, backup de producción y recuperación real
  rollback/histórico comprobados.
