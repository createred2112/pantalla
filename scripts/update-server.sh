#!/usr/bin/env bash
set -Eeuo pipefail

APP_USER="${APP_USER:-gasteizberri-pantalla}"
APP_DIR="${APP_DIR:-/home/$APP_USER/htdocs/pantalla.gasteizberri.com}"
BRANCH="${BRANCH:-main}"
PORT="${PORT:-3037}"
APP_ENTRY="${APP_ENTRY:-src/server.js}"

log() {
  printf '\n==> %s\n' "$*"
}

fail() {
  printf '\nERROR: %s\n' "$*" >&2
  exit 1
}

quote() {
  printf "%q" "$1"
}

load_node() {
  if command -v npm >/dev/null 2>&1 && command -v node >/dev/null 2>&1; then
    return 0
  fi

  if [ -s "$HOME/.nvm/nvm.sh" ]; then
    # shellcheck disable=SC1091
    . "$HOME/.nvm/nvm.sh"
    nvm use 22 >/dev/null 2>&1 || nvm use node >/dev/null 2>&1 || true
  fi

  command -v npm >/dev/null 2>&1 || fail "npm no está disponible para $(id -un)"
  command -v node >/dev/null 2>&1 || fail "node no está disponible para $(id -un)"
}

update_code() {
  cd "$APP_DIR" || fail "No existe $APP_DIR"
  [ -d .git ] || fail "$APP_DIR no es un repositorio git"

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

restart_app() {
  log "Reiniciando proceso Node"
  local pids
  pids="$(ps -eo pid=,cmd= | awk -v needle="$APP_DIR/$APP_ENTRY" 'index($0, needle) { print $1 }')"
  if [ -n "$pids" ]; then
    # shellcheck disable=SC2086
    kill -9 $pids || true
  else
    log "No había proceso Node activo"
  fi

  sleep 5
  log "Comprobando versión en local"
  curl -fsS "http://127.0.0.1:$PORT/api/whoami" || true
  printf '\n'
}

run_as_app_user() {
  local script_path tmp_script cmd
  script_path="$(readlink -f "$0" 2>/dev/null || true)"
  [ -n "$script_path" ] && [ -r "$script_path" ] || fail "Guarda este script en un archivo antes de ejecutarlo"

  tmp_script="/tmp/pantalla-update-server-as-user.$$"
  cp "$script_path" "$tmp_script"
  chmod 755 "$tmp_script"
  trap "rm -f $(quote "$tmp_script")" EXIT

  cmd="PANTALLA_AS_APP_USER=1 APP_DIR=$(quote "$APP_DIR") BRANCH=$(quote "$BRANCH") PORT=$(quote "$PORT") APP_ENTRY=$(quote "$APP_ENTRY") bash $(quote "$tmp_script")"
  if command -v runuser >/dev/null 2>&1; then
    runuser -l "$APP_USER" -c "$cmd"
  else
    su - "$APP_USER" -c "$cmd"
  fi
  rm -f "$tmp_script"
}

main() {
  if [ "$(id -u)" -eq 0 ] && [ "${PANTALLA_AS_APP_USER:-}" != "1" ]; then
    log "Actualizando código como $APP_USER"
    run_as_app_user
    restart_app
    return
  fi

  update_code
  if [ "${PANTALLA_AS_APP_USER:-}" != "1" ]; then
    restart_app
  fi
}

main "$@"
