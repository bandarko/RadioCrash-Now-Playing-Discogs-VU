#!/usr/bin/env bash
set -Eeuo pipefail

SOURCE_DIR="/home/banadmin/rc-vu-staging"
APP_DIR="/opt/radiocrash-vu"
SERVICE_SOURCE="${SOURCE_DIR}/rc-vu.service"
SERVICE_TARGET="/etc/systemd/system/rc-vu.service"
NGINX_SOURCE="${SOURCE_DIR}/nginx-radiocrash-vu.conf"
NGINX_SNIPPET="/etc/nginx/snippets/radiocrash-vu.conf"
NGINX_CONF="/etc/nginx/conf.d/shoutcast.conf"
BACKUP_DIR="/var/backups/radiocrash-vu"
INCLUDE_LINE="    include /etc/nginx/snippets/radiocrash-vu.conf;"
STAMP="$(date +%Y%m%d-%H%M%S)"
NGINX_BACKUP="${BACKUP_DIR}/shoutcast.conf.${STAMP}"
HEALTH_FILE="$(mktemp /tmp/rc-vu-health.XXXXXX)"
NGINX_TEMP=""
DEPLOY_OK=0

cleanup() {
    rm -f "${HEALTH_FILE}"
    if [[ -n "${NGINX_TEMP}" ]]; then
        rm -f "${NGINX_TEMP}"
    fi
}

rollback_on_error() {
    local exit_code=$?
    if [[ ${DEPLOY_OK} -eq 0 ]]; then
        echo
        echo "Greška pri instalaciji; vraćam prethodnu Nginx konfiguraciju..." >&2
        if [[ -f "${NGINX_BACKUP}" ]]; then
            install -o root -g root -m 0644 "${NGINX_BACKUP}" "${NGINX_CONF}"
        fi
        systemctl stop rc-vu.service >/dev/null 2>&1 || true
        systemctl disable rc-vu.service >/dev/null 2>&1 || true
        systemctl daemon-reload >/dev/null 2>&1 || true
        if nginx -t >/dev/null 2>&1; then
            systemctl reload nginx >/dev/null 2>&1 || true
        fi
    fi
    cleanup
    exit "${exit_code}"
}

trap rollback_on_error ERR INT TERM
trap cleanup EXIT

if [[ ${EUID} -ne 0 ]]; then
    echo "Pokreni ovu skriptu sa sudo." >&2
    exit 1
fi

for command_name in ffmpeg python3 nginx curl systemctl ss install awk grep; do
    command -v "${command_name}" >/dev/null || {
        echo "Nedostaje naredba: ${command_name}" >&2
        exit 1
    }
done

for source_file in \
    "${SOURCE_DIR}/rc_vu_server.py" \
    "${SERVICE_SOURCE}" \
    "${NGINX_SOURCE}" \
    "${NGINX_CONF}"; do
    [[ -f "${source_file}" ]] || {
        echo "Nedostaje datoteka: ${source_file}" >&2
        exit 1
    }
done

python3 -m py_compile "${SOURCE_DIR}/rc_vu_server.py"

location_count="$(grep -Ec '^[[:space:]]*location[[:space:]]+/[[:space:]]*[{]' "${NGINX_CONF}" || true)"
if ! grep -Fq "include /etc/nginx/snippets/radiocrash-vu.conf;" "${NGINX_CONF}" \
    && [[ "${location_count}" -ne 1 ]]; then
    echo "Nisam pronašao točno jednu 'location /' točku u ${NGINX_CONF}; ništa nije promijenjeno." >&2
    exit 1
fi

mkdir -p "${APP_DIR}" /etc/nginx/snippets "${BACKUP_DIR}"
install -o root -g root -m 0644 "${NGINX_CONF}" "${NGINX_BACKUP}"
printf '%s\n' "${NGINX_BACKUP}" > "${BACKUP_DIR}/last-nginx-backup"

systemctl stop rc-vu.service >/dev/null 2>&1 || true
if ss -ltnH 'sport = :8767' | grep -q .; then
    echo "Port 8767 koristi drugi proces; instalacija je zaustavljena prije promjene Nginxa." >&2
    exit 1
fi

install -o root -g root -m 0755 "${SOURCE_DIR}/rc_vu_server.py" "${APP_DIR}/rc_vu_server.py"
install -o root -g root -m 0644 "${SERVICE_SOURCE}" "${SERVICE_TARGET}"
install -o root -g root -m 0644 "${NGINX_SOURCE}" "${NGINX_SNIPPET}"

if ! grep -Fq "include /etc/nginx/snippets/radiocrash-vu.conf;" "${NGINX_CONF}"; then
    NGINX_TEMP="$(mktemp "${NGINX_CONF}.tmp.XXXXXX")"
    awk -v include_line="${INCLUDE_LINE}" '
        !inserted && /^[[:space:]]*location[[:space:]]+\/[[:space:]]*[{]/ {
            print "    # Radio Crash server-side VU endpoints"
            print include_line
            print ""
            inserted = 1
        }
        { print }
        END { if (!inserted) exit 42 }
    ' "${NGINX_CONF}" > "${NGINX_TEMP}"
    chown --reference="${NGINX_CONF}" "${NGINX_TEMP}"
    chmod --reference="${NGINX_CONF}" "${NGINX_TEMP}"
    mv "${NGINX_TEMP}" "${NGINX_CONF}"
    NGINX_TEMP=""
fi

systemctl daemon-reload
systemctl enable --now rc-vu.service

service_ready=0
for _attempt in $(seq 1 30); do
    if curl -fsS --max-time 2 http://127.0.0.1:8767/health > "${HEALTH_FILE}" \
        && grep -Fq '"online":true' "${HEALTH_FILE}"; then
        service_ready=1
        break
    fi
    sleep 0.5
done

if [[ ${service_ready} -ne 1 ]]; then
    echo "VU servis nije postao spreman. Zadnje stanje:" >&2
    cat "${HEALTH_FILE}" >&2 || true
    journalctl -u rc-vu.service -n 30 --no-pager >&2 || true
    exit 1
fi

nginx -t
systemctl reload nginx

curl -fsS --max-time 5 http://127.0.0.1:8767/health
echo
systemctl --no-pager --full status rc-vu.service | sed -n '1,12p'

DEPLOY_OK=1
echo
echo "Radio Crash VU je instaliran. Nginx backup: ${NGINX_BACKUP}"
