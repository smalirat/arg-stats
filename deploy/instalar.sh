#!/usr/bin/env bash
# Instala una versión de ArgStats en la VM. Lo corre desplegar.ps1 (no hace
# falta correrlo a mano):
#
#   sudo bash instalar.sh /tmp/argstats-20261103-0930.tar.gz [/tmp/backend.env]
#
# Cada versión queda en /opt/argstats/releases/<fecha> y /opt/argstats/actual
# apunta a la que corre. Si después de reiniciar la app no responde, vuelve
# sola a la versión anterior. Se guardan las últimas 3.
set -euo pipefail

PAQUETE="${1:?Falta el .tar.gz}"
ENV_NUEVO="${2:-}"
APP=/opt/argstats
VERSION="$(basename "$PAQUETE" .tar.gz | sed 's/^argstats-//')"
DESTINO="$APP/releases/$VERSION"
ANTERIOR="$(readlink -f "$APP/actual" 2>/dev/null || true)"

if [[ -n "$ENV_NUEVO" ]]; then
    echo "== backend.env nuevo"
    install -o argstats -g argstats -m 600 "$ENV_NUEVO" "$APP/compartido/backend.env"
    rm -f "$ENV_NUEVO"
fi

if [[ ! -f "$APP/compartido/backend.env" ]]; then
    echo "Falta $APP/compartido/backend.env (desplegá con -SubirEnv la primera vez)." >&2
    exit 1
fi

echo "== Versión $VERSION"
rm -rf "$DESTINO"
mkdir -p "$DESTINO"
tar -xzf "$PAQUETE" -C "$DESTINO"
rm -f "$PAQUETE"
chown -R argstats:argstats "$DESTINO"

echo "== Dependencias"
for parte in backend frontend; do
    sudo -u argstats -H bash -c "cd '$DESTINO/$parte' && npm ci --omit=dev --no-audit --no-fund --loglevel=error"
done

echo "== Cambio de versión y reinicio"
ln -sfn "$DESTINO" "$APP/actual"
systemctl restart argstats-backend argstats-frontend

responde() {
    for _ in $(seq 1 30); do
        if curl -fsS -o /dev/null http://127.0.0.1:3000/api/ediciones \
            && curl -fsS -o /dev/null http://127.0.0.1:4321/; then
            return 0
        fi
        sleep 2
    done
    return 1
}

if responde; then
    echo "== OK: la app responde"
else
    echo "== La versión nueva no responde" >&2
    journalctl -u argstats-backend -u argstats-frontend -n 40 --no-pager >&2 || true
    if [[ -n "$ANTERIOR" && -d "$ANTERIOR" && "$ANTERIOR" != "$DESTINO" ]]; then
        echo "== Vuelvo a la versión anterior: $(basename "$ANTERIOR")" >&2
        ln -sfn "$ANTERIOR" "$APP/actual"
        systemctl restart argstats-backend argstats-frontend
    fi
    exit 1
fi

echo "== Limpieza (quedan las últimas 3 versiones)"
ls -1dt "$APP"/releases/* | tail -n +4 | xargs -r rm -rf
