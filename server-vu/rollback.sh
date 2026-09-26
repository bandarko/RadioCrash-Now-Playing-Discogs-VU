#!/usr/bin/env bash
set -Eeuo pipefail

NGINX_CONF="/etc/nginx/conf.d/shoutcast.conf"
BACKUP_POINTER="/var/backups/radiocrash-vu/last-nginx-backup"

if [[ ${EUID} -ne 0 ]]; then
    echo "Run this script with sudo." >&2
    exit 1
fi

[[ -f "${BACKUP_POINTER}" ]] || {
    echo "No record of the latest Nginx backup was found." >&2
    exit 1
}

BACKUP_FILE="$(head -n 1 "${BACKUP_POINTER}")"
[[ "${BACKUP_FILE}" == /var/backups/radiocrash-vu/shoutcast.conf.* ]] || {
    echo "Invalid backup path: ${BACKUP_FILE}" >&2
    exit 1
}
[[ -f "${BACKUP_FILE}" ]] || {
    echo "Backup does not exist: ${BACKUP_FILE}" >&2
    exit 1
}

install -o root -g root -m 0644 "${BACKUP_FILE}" "${NGINX_CONF}"
nginx -t
systemctl reload nginx
systemctl disable --now rc-vu.service >/dev/null 2>&1 || true

echo "Restored ${BACKUP_FILE}; Nginx was validated and reloaded; rc-vu was disabled."
