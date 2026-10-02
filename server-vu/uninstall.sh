#!/usr/bin/env bash
set -Eeuo pipefail

NGINX_CONF="/etc/nginx/conf.d/shoutcast.conf"
NGINX_SNIPPET="/etc/nginx/snippets/radiocrash-vu.conf"
SERVICE_FILE="/etc/systemd/system/rc-vu.service"
APP_DIR="/opt/radiocrash-vu"
STAGING_DIR="/home/banadmin/rc-vu-staging"
BACKUP_DIR="/var/backups/radiocrash-vu"
WORK_DIR="$(mktemp -d /tmp/rc-vu-remove.XXXXXX)"
ORIGINAL_CONF="${WORK_DIR}/shoutcast.conf.original"
UPDATED_CONF="${WORK_DIR}/shoutcast.conf.updated"
RESTORE_NEEDED=0

cleanup() {
    if [[ ${RESTORE_NEEDED} -eq 1 && -f "${ORIGINAL_CONF}" ]]; then
        install -o root -g root -m 0644 "${ORIGINAL_CONF}" "${NGINX_CONF}"
        nginx -t >/dev/null 2>&1 && systemctl reload nginx >/dev/null 2>&1 || true
    fi
    rm -rf -- "${WORK_DIR}"
}
trap cleanup EXIT INT TERM ERR

if [[ ${EUID} -ne 0 ]]; then
    echo "Run this script with sudo." >&2
    exit 1
fi

for command_name in nginx systemctl install awk grep; do
    command -v "${command_name}" >/dev/null || {
        echo "Missing command: ${command_name}" >&2
        exit 1
    }
done

[[ -f "${NGINX_CONF}" ]] || {
    echo "Missing Nginx configuration: ${NGINX_CONF}" >&2
    exit 1
}

install -o root -g root -m 0644 "${NGINX_CONF}" "${ORIGINAL_CONF}"
RESTORE_NEEDED=1

awk '
    /^[[:space:]]*#[[:space:]]*Radio Crash server-side VU endpoints[[:space:]]*$/ { next }
    /^[[:space:]]*include[[:space:]]+\/etc\/nginx\/snippets\/radiocrash-vu\.conf;[[:space:]]*$/ { next }
    { print }
' "${NGINX_CONF}" > "${UPDATED_CONF}"

if grep -Fq "radiocrash-vu.conf" "${UPDATED_CONF}"; then
    echo "Unexpected VU include remains in ${NGINX_CONF}; nothing was removed." >&2
    exit 1
fi

install -o root -g root -m 0644 "${UPDATED_CONF}" "${NGINX_CONF}"
nginx -t

systemctl disable --now rc-vu.service >/dev/null 2>&1 || true
rm -f -- "${SERVICE_FILE}" "${NGINX_SNIPPET}"
rm -rf -- "${APP_DIR}"
systemctl daemon-reload
systemctl reset-failed rc-vu.service >/dev/null 2>&1 || true
systemctl reload nginx

RESTORE_NEEDED=0

rm -rf -- "${STAGING_DIR}" "${BACKUP_DIR}"

if systemctl is-active --quiet rc-vu.service; then
    echo "rc-vu.service is still active." >&2
    exit 1
fi

if command -v ss >/dev/null && ss -ltnH 'sport = :8767' | grep -q .; then
    echo "Port 8767 is still listening." >&2
    exit 1
fi

echo "Radio Crash server-side VU was removed."
echo "Nginx configuration is valid and reloaded."
echo "The shared ffmpeg package was intentionally left installed."
