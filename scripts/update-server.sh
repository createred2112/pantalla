#!/usr/bin/env bash
# DEPLOY VERIFICADO (F2). Uso:
#   bash scripts/update-server.sh              actualizar + reiniciar + VERIFICAR
#   bash scripts/update-server.sh --rollback   volver al commit del deploy anterior
#   bash scripts/update-server.sh --healthcheck  solo comprobar el servidor actual
#
# Diferencias con la versión anterior (que sufrimos):
#  - El healthcheck FALLA de verdad: HTTP 200 en /api/whoami + versión esperada
#    + humo mínimo. Antes era `curl || true`, que nunca fallaba.
#  - Se comprueba que el proceso VOLVIÓ a arrancar tras el reinicio.
#  - Antes de actualizar se apunta el commit actual: rollback en UN comando.
set -Eeuo pipefail

APP_USER="${APP_USER:-gasteizberri-pantalla}"
APP_DIR="${APP_DIR:-/home/$APP_USER/htdocs/pantalla.gasteizberri.com}"
BRANCH="${BRANCH:-main}"
PORT="${PORT:-3037}"
APP_ENTRY="${APP_ENTRY:-src/server.js}"
LAST_DEPLOY_FILE="$APP_DIR/.last-deploy"

log() { printf '\n==> %s\n' "$*"; }
fail() { printf '\nERROR: %s\n' "$*" >&2; exit 1; }
quote() { printf "%q" "$1"; }

load_node() {
  if command -v npm >/dev/null 2>&1 && command -v node >/dev/null 2>&1; then return 0; fi
  if [ -s "$HOME/.nvm/nvm.sh" ]; then
    # shellcheck disable=SC1091
    . "$HOME/.nvm/nvm.sh"
    nvm use 22 >/dev/null 2>&1 || nvm use node >/dev/null 2>&1 || true
  fi
  command -v npm >/dev/null 2>&1 || fail "npm no está disponible para $(id -un)"
  command -v node >/dev/null 2>&1 || fail "node no está disponible para $(id -un)"
}

# ---------- HEALTHCHECK: la única fuente de verdad de "el deploy salió bien" ----------
healthcheck() {
  local expected who got assets
  expected="$(node -p "require('$APP_DIR/package.json').version" 2>/dev/null || true)"
  [ -n "$expected" ] || fail "No se pudo leer la versión esperada de package.json"

  log "Esperando al servidor en el puerto $PORT (hasta 45 s)"
  local up=""
  for _ in $(seq 1 45); do
    if who="$(curl -fsS --max-time 3 "http://127.0.0.1:$PORT/api/whoami" 2>/dev/null)"; then up=1; break; fi
    sleep 1
  done
  [ -n "$up" ] || fail "El servidor NO responde en el puerto $PORT. El proceso no arrancó tras el reinicio: revisa el supervisor (CloudPanel/PM2) y los logs. Rollback: bash scripts/update-server.sh --rollback"

  got="$(printf '%s' "$who" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{console.log(JSON.parse(d).version||'')}catch{console.log('')}})")"
  [ "$got" = "$expected" ] || fail "El servidor responde pero con la versión '$got' (se esperaba '$expected'): sigue corriendo el código VIEJO. Reinicia el proceso o haz rollback: bash scripts/update-server.sh --rollback"

  assets="$(printf '%s' "$who" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{console.log(JSON.parse(d).assets||'')}catch{console.log('')}})")"
  [ -n "$assets" ] || fail "El servidor no anuncia la huella de assets: el panel podría servir interfaz vieja"

  log "Humo mínimo"
  curl -fsS --max-time 5 "http://127.0.0.1:$PORT/login" | grep -qi '<form' \
    || fail "La página de login no se sirve bien"
  local code
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "http://127.0.0.1:$PORT/")"
  { [ "$code" = "200" ] || [ "$code" = "302" ]; } \
    || fail "La portada del panel devolvió HTTP $code"

  log "HEALTHCHECK OK: v$expected en el puerto $PORT, huella $assets"
}

update_code() {
  cd "$APP_DIR" || fail "No existe $APP_DIR"
  [ -d .git ] || fail "$APP_DIR no es un repositorio git"

  log "Apuntando el commit actual (para rollback en un comando)"
  git rev-parse HEAD > "$LAST_DEPLOY_FILE"

  log "Guardando config local"
  if [ -f config/pantalla.config.json ]; then
    cp config/pantalla.config.json "$HOME/pantalla.config.json.bak"
  fi

  log "Limpiando package-lock local"
  git restore --staged --worktree package-lock.json 2>/dev/null || true

  log "Descargando última versión"
  git pull --ff-only origin "$BRANCH"

  if [ -f "$HOME/pantalla.config.json.bak" ]; then
    cp "$HOME/pantalla.config.json.bak" config/pantalla.config.json
  fi

  log "Instalando dependencias"
  load_node
  npm install

  log "Versión instalada"
  node -p "require('./package.json').version"
}

rollback_code() {
  cd "$APP_DIR" || fail "No existe $APP_DIR"
  [ -f "$LAST_DEPLOY_FILE" ] || fail "No hay commit anterior apuntado ($LAST_DEPLOY_FILE). Rollback manual: git log --oneline y git reset --hard <commit>"
  local prev
  prev="$(cat "$LAST_DEPLOY_FILE")"
  log "Volviendo al commit del deploy anterior: $prev"
  git reset --hard "$prev"
  log "Instalando dependencias de esa versión"
  load_node
  npm install
}

restart_app() {
  log "Reiniciando proceso Node"
  local pids
  pids="$(ps -eo pid=,cmd= | awk -v needle="$APP_DIR/$APP_ENTRY" 'index($0, needle) { print $1 }')"
  if [ -n "$pids" ]; then
    # shellcheck disable=SC2086
    kill $pids 2>/dev/null || true
    sleep 3
    # shellcheck disable=SC2086
    kill -9 $pids 2>/dev/null || true
  else
    log "No había proceso Node activo"
  fi
  # El supervisor (CloudPanel/PM2) debe levantarlo de nuevo; healthcheck() se
  # encarga de comprobar que de verdad volvió, con la versión nueva.
}

run_as_app_user() {
  local script_path tmp_script cmd mode
  mode="${1:-}"
  script_path="$(readlink -f "$0" 2>/dev/null || true)"
  [ -n "$script_path" ] && [ -r "$script_path" ] || fail "Guarda este script en un archivo antes de ejecutarlo"

  tmp_script="/tmp/pantalla-update-server-as-user.$$"
  cp "$script_path" "$tmp_script"
  chmod 755 "$tmp_script"
  trap "rm -f $(quote "$tmp_script")" EXIT

  cmd="PANTALLA_AS_APP_USER=1 APP_DIR=$(quote "$APP_DIR") BRANCH=$(quote "$BRANCH") PORT=$(quote "$PORT") APP_ENTRY=$(quote "$APP_ENTRY") bash $(quote "$tmp_script") $mode"
  if command -v runuser >/dev/null 2>&1; then
    runuser -l "$APP_USER" -c "$cmd"
  else
    su - "$APP_USER" -c "$cmd"
  fi
  rm -f "$tmp_script"
}

main() {
  local mode="${1:-}"

  if [ "$mode" = "--healthcheck" ]; then
    load_node
    healthcheck
    return
  fi

  if [ "$(id -u)" -eq 0 ] && [ "${PANTALLA_AS_APP_USER:-}" != "1" ]; then
    log "Ejecutando como $APP_USER"
    run_as_app_user "$mode"
    restart_app
    # root puede no tener Node/npm aunque el usuario del sitio sí (CloudPanel
    # instala NVM por usuario). La actualización ya se ejecutó como APP_USER;
    # la verificación debe usar exactamente el mismo entorno.
    run_as_app_user "--healthcheck"
    log "DEPLOY OK"
    return
  fi

  if [ "$mode" = "--rollback" ]; then
    rollback_code
  else
    update_code
  fi

  if [ "${PANTALLA_AS_APP_USER:-}" != "1" ]; then
    restart_app
    load_node
    healthcheck
    log "DEPLOY OK"
  fi
}

main "$@"
