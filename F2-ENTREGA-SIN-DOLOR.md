# F2 — Entrega sin dolor

> Objetivo cumplido: un deploy ya no puede pasar desapercibido, ni servir
> panel viejo, ni perder datos. Todo con su test (`npm test` lo cubre).

## 1. La caché ya no es un enemigo posible

- Todos los JS/CSS del panel se sirven como `archivo.js?v=<hash-del-contenido>`
  desde HTML no cacheable. Si el archivo cambia, cambia su URL: ni Safari, ni
  la PWA, ni ningún proxy pueden servir código viejo. Las URLs con huella se
  cachean un año (`immutable`) — más rápido, y sin riesgo por diseño.
- HTML, `sw.js` y manifest: siempre `no-cache`.
- Test: `tests/e2e/entrega.spec.js` (huellas, cabeceras, coherencia
  página↔servidor).

## 2. Aviso de actualización en el panel abierto

- Cada página nace sabiendo su huella (`window.PANTALLA_CLIENT`). Al volver la
  PWA a primer plano (y cada 5 min) se compara con `/api/whoami`; si el
  servidor cambió, banner **"Hay una versión nueva del panel — Actualizar"**
  que recarga en un toque. Nunca más "arreglado en el servidor pero el iPhone
  enseña lo viejo".
- Test: simula huella obsoleta → banner → recarga → banner desaparece.

## 3. Deploy verificado y rollback en un comando

`scripts/update-server.sh` ahora:

- Apunta el commit actual antes de actualizar (`.last-deploy`).
- Tras reiniciar, ESPERA a que el proceso vuelva (hasta 45 s) y exige:
  HTTP 200 en `/api/whoami` + **versión exacta** de package.json + huella de
  assets presente + humo mínimo (login y portada se sirven). Cualquier fallo →
  mensaje claro y `exit 1`. (El script viejo llevaba `curl || true`: no podía
  fallar jamás.)
- `bash scripts/update-server.sh --rollback` → vuelve al commit del deploy
  anterior, reinstala y re-verifica. `--healthcheck` → solo comprobar.
- Verificado en local: OK con versión buena (exit 0), rojo con versión que no
  coincide (exit 1) y rojo si el puerto no responde.

## 4. Backup diario con restauración probada

- El propio servidor hace backup diario (a partir de las 04:30, o al arrancar
  si ese día no lo hay) de `data/` + `config/` en `backups/`, retención 14
  días. Sin cron que configurar. Excluye `data/emisiones` (ya es un histórico
  con su propia retención) y cachés. Tamaño actual con tus datos: ~155 MB/día
  (las fotos pesan; 14 días ≈ 2,2 GB — vigilar el disco del VPS).
- Restaurar: `npm run backup:restore -- backups/pantalla-datos-AAAA-MM-DD.tgz`
  (antes de pisar nada guarda el estado actual en `pre-restauracion-*.tgz`).
- Test `scripts/qa-backup.js` (dentro de `npm test`): ciclo completo backup →
  corrupción y borrado → restauración → retención, en un directorio temporal.

## Arreglo extra que salió al paso

- Las rutas HTML no mandaban `Cache-Control` (lo cazó el test nuevo): fijado.

## Estado de verificación

Con datos reales del VPS: unit OK · backup OK · auditoría 2×108 OK · humo e2e
11/11 (los 9 de F1 + 2 de entrega) · matriz visual 12 hojas en verde.
