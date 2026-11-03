#!/usr/bin/env bash
# Prepara una VM de Oracle Cloud (Ubuntu 22.04 / 24.04, x86 o ARM) para correr
# ArgStats. Se corre UNA vez, como root:
#
#   sudo bash preparar-servidor.sh argstats.com.ar [dominio-viejo ...]
#
# Sin dominio propio se puede usar <ip-con-guiones>.sslip.io (ej.
# argstats.129-146-10-20.sslip.io): resuelve a la IP y Caddy le saca
# certificado igual. Los dominios que se pasen después del primero redirigen a
# él (para no romper los links cuando se cambia de dominio).
#
# Qué hace: swap, Node.js, Caddy (HTTPS automático), usuario y carpetas de la
# app, servicios de systemd y puertos 80/443 en el firewall de la VM. Se puede
# volver a correr sin romper nada.
set -euo pipefail

DOMINIO="${1:?Uso: sudo bash preparar-servidor.sh <dominio> [dominio-viejo ...]}"
shift
DOMINIOS_VIEJOS=("$@")
NODE_MAYOR=24
APP=/opt/argstats

if [[ $EUID -ne 0 ]]; then
    echo "Correlo con sudo." >&2
    exit 1
fi

echo "== Paquetes del sistema"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y curl ca-certificates gnupg debian-keyring debian-archive-keyring apt-transport-https iptables-persistent

echo "== Swap (las VM gratis tienen 1 GB de RAM: sin swap, npm puede quedarse sin memoria)"
if ! swapon --show | grep -q /swapfile; then
    fallocate -l 2G /swapfile
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile
    grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
    sysctl -w vm.swappiness=10
    echo 'vm.swappiness=10' > /etc/sysctl.d/99-argstats.conf
fi

echo "== Node.js $NODE_MAYOR"
if ! command -v node >/dev/null || [[ "$(node -v | cut -d. -f1 | tr -d v)" -lt $NODE_MAYOR ]]; then
    curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAYOR}.x" | bash -
    apt-get install -y nodejs
fi
node -v

echo "== Caddy"
if ! command -v caddy >/dev/null; then
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
    apt-get update -y
    apt-get install -y caddy
fi

echo "== Usuario y carpetas"
id argstats >/dev/null 2>&1 || useradd --system --home "$APP" --shell /usr/sbin/nologin argstats
mkdir -p "$APP/releases" "$APP/compartido"
chown -R argstats:argstats "$APP"
chmod 755 "$APP"

echo "== Firewall de la VM: 80 y 443"
# Las imágenes de Ubuntu de Oracle traen iptables que rechaza todo salvo SSH.
# (Además hay que abrir los puertos en la "Security List" de la VCN, desde la consola.)
for puerto in 80 443; do
    iptables -C INPUT -p tcp -m state --state NEW --dport "$puerto" -j ACCEPT 2>/dev/null \
        || iptables -I INPUT 1 -p tcp -m state --state NEW --dport "$puerto" -j ACCEPT
done
netfilter-persistent save

echo "== Servicios"
cat > /etc/systemd/system/argstats-backend.service <<EOF
[Unit]
Description=ArgStats backend (API)
After=network-online.target
Wants=network-online.target

[Service]
User=argstats
WorkingDirectory=$APP/actual/backend
EnvironmentFile=$APP/compartido/backend.env
# Puerto y host van en la línea de comando: así no los pisa un PORT que venga en backend.env
ExecStart=/usr/bin/env NODE_ENV=production HOST=127.0.0.1 PORT=3000 /usr/bin/node --max-old-space-size=384 server.js
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

cat > /etc/systemd/system/argstats-frontend.service <<EOF
[Unit]
Description=ArgStats frontend (Astro)
After=network-online.target argstats-backend.service
Wants=network-online.target

[Service]
User=argstats
WorkingDirectory=$APP/actual/frontend
Environment=NODE_ENV=production HOST=127.0.0.1 PORT=4321 API_URL=http://127.0.0.1:3000
ExecStart=/usr/bin/node --max-old-space-size=256 dist/server/entry.mjs
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

# Una consulta por día para que Supabase no pause el proyecto gratis (lo pausa tras 7 días sin
# actividad). En /api/buscar la búsqueda de torneos no usa la cache del backend: siempre llega a la base.
cat > /etc/systemd/system/argstats-despertar.service <<EOF
[Unit]
Description=ArgStats: consulta diaria a Supabase
After=argstats-backend.service

[Service]
Type=oneshot
ExecStart=/usr/bin/curl -fsS -o /dev/null --max-time 60 "http://127.0.0.1:3000/api/buscar?q=river"
EOF

cat > /etc/systemd/system/argstats-despertar.timer <<EOF
[Unit]
Description=ArgStats: consulta diaria a Supabase

[Timer]
OnBootSec=10min
OnUnitActiveSec=1d
RandomizedDelaySec=1h
Persistent=true

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
systemctl enable argstats-backend argstats-frontend
systemctl enable --now argstats-despertar.timer

echo "== Caddy: $DOMINIO"
cat > /etc/caddy/Caddyfile <<EOF
$DOMINIO {
    encode zstd gzip

    header {
        Strict-Transport-Security "max-age=31536000"
        X-Content-Type-Options "nosniff"
        Referrer-Policy "strict-origin-when-cross-origin"
        X-Frame-Options "DENY"
        -Server
    }

    # Los archivos de /_astro llevan un hash en el nombre: Caddy los sirve directo y se cachean un año
    handle /_astro/* {
        root * $APP/actual/frontend/dist/client
        header Cache-Control "public, max-age=31536000, immutable"
        file_server
    }

    handle {
        reverse_proxy 127.0.0.1:4321
    }

    log {
        output file /var/log/caddy/argstats.log {
            roll_size 10MiB
            roll_keep 5
        }
    }
}

# Con www, redirige al dominio sin www
www.$DOMINIO {
    redir https://$DOMINIO{uri} permanent
}
EOF

# Sin dominio propio (sslip.io, etc.) el bloque www no sirve: se saca
if [[ "$DOMINIO" == *sslip.io || "$DOMINIO" == *nip.io || "$DOMINIO" == *duckdns.org ]]; then
    sed -i '/^# Con www/,$d' /etc/caddy/Caddyfile
fi

for viejo in "${DOMINIOS_VIEJOS[@]}"; do
    cat >> /etc/caddy/Caddyfile <<EOF

# Dominio anterior: redirige al actual
$viejo {
    redir https://$DOMINIO{uri} permanent
}
EOF
done

caddy fmt --overwrite /etc/caddy/Caddyfile
caddy validate --config /etc/caddy/Caddyfile
# validate corre como root y crea el log como root: Caddy (usuario caddy) después no lo podría abrir
mkdir -p /var/log/caddy
chown -R caddy:caddy /var/log/caddy
systemctl restart caddy

echo
echo "Listo. Falta:"
echo "  1. Abrir 80 y 443 en la Security List de la VCN (consola de Oracle)."
echo "  2. Crear $APP/compartido/backend.env (lo sube desplegar.ps1 con -SubirEnv)."
echo "  3. Desplegar la app con desplegar.ps1 desde la PC."
