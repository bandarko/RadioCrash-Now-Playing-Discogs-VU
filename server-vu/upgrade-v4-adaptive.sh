#!/usr/bin/env bash
set -Eeuo pipefail

SOURCE_DIR="/home/banadmin/rc-vu-staging"
APP_DIR="/opt/radiocrash-vu"
APP_TARGET="${APP_DIR}/rc_vu_server.py"
SERVICE_TARGET="/etc/systemd/system/rc-vu.service"
NGINX_TARGET="/etc/nginx/snippets/radiocrash-vu.conf"
BACKUP_DIR="/var/backups/radiocrash-vu"
STAMP="$(date +%Y%m%d-%H%M%S)"
APP_BACKUP="${BACKUP_DIR}/rc_vu_server.py.${STAMP}"
SERVICE_BACKUP="${BACKUP_DIR}/rc-vu.service.${STAMP}"
NGINX_BACKUP="${BACKUP_DIR}/radiocrash-vu.conf.${STAMP}"
HEALTH_FILE="$(mktemp /tmp/rc-vu-health.XXXXXX)"
HISTORY_FILE="$(mktemp /tmp/rc-vu-history.XXXXXX)"
SUCCESS=0

cleanup() {
    rm -f "${HEALTH_FILE}" "${HISTORY_FILE}"
}

rollback() {
    local exit_code=$?
    if [[ ${SUCCESS} -eq 0 ]]; then
        echo "Upgrade failed; restoring the previous VU service and Nginx endpoint..." >&2
        [[ -f "${APP_BACKUP}" ]] && install -o root -g root -m 0755 "${APP_BACKUP}" "${APP_TARGET}"
        [[ -f "${SERVICE_BACKUP}" ]] && install -o root -g root -m 0644 "${SERVICE_BACKUP}" "${SERVICE_TARGET}"
        [[ -f "${NGINX_BACKUP}" ]] && install -o root -g root -m 0644 "${NGINX_BACKUP}" "${NGINX_TARGET}"
        systemctl daemon-reload || true
        systemctl restart rc-vu.service || true
        if nginx -t; then
            systemctl reload nginx || true
        fi
    fi
    cleanup
    exit "${exit_code}"
}

trap rollback ERR INT TERM
trap cleanup EXIT

if [[ ${EUID} -ne 0 ]]; then
    echo "Run this script with sudo." >&2
    exit 1
fi

for command_name in python3 nginx curl systemctl install grep; do
    command -v "${command_name}" >/dev/null || {
        echo "Missing command: ${command_name}" >&2
        exit 1
    }
done

for source_file in \
    "${SOURCE_DIR}/rc_vu_server.py" \
    "${SOURCE_DIR}/rc-vu.service" \
    "${SOURCE_DIR}/nginx-radiocrash-vu.conf" \
    "${APP_TARGET}" \
    "${SERVICE_TARGET}" \
    "${NGINX_TARGET}"; do
    [[ -f "${source_file}" ]] || { echo "Missing ${source_file}" >&2; exit 1; }
done

python3 -m py_compile "${SOURCE_DIR}/rc_vu_server.py"
grep -Fq 'Environment=RC_VU_UPDATES_PER_SECOND=120' "${SOURCE_DIR}/rc-vu.service"
grep -Fq 'Environment=RC_VU_BUFFER_SECONDS=1.10' "${SOURCE_DIR}/rc-vu.service"
grep -Fq 'Environment=RC_VU_ANALYSIS_FRAMES=256' "${SOURCE_DIR}/rc-vu.service"
grep -Fq 'Environment=RC_VU_HISTORY_SECONDS=30' "${SOURCE_DIR}/rc-vu.service"
grep -Fq 'location = /vu/history' "${SOURCE_DIR}/nginx-radiocrash-vu.conf"

mkdir -p "${BACKUP_DIR}"
install -o root -g root -m 0755 "${APP_TARGET}" "${APP_BACKUP}"
install -o root -g root -m 0644 "${SERVICE_TARGET}" "${SERVICE_BACKUP}"
install -o root -g root -m 0644 "${NGINX_TARGET}" "${NGINX_BACKUP}"

install -o root -g root -m 0755 "${SOURCE_DIR}/rc_vu_server.py" "${APP_TARGET}"
install -o root -g root -m 0644 "${SOURCE_DIR}/rc-vu.service" "${SERVICE_TARGET}"
install -o root -g root -m 0644 "${SOURCE_DIR}/nginx-radiocrash-vu.conf" "${NGINX_TARGET}"

systemctl daemon-reload
systemctl restart rc-vu.service

ready=0
for _attempt in $(seq 1 60); do
    if curl -fsS --max-time 2 http://127.0.0.1:8767/health > "${HEALTH_FILE}" \
        && grep -Fq '"online":true' "${HEALTH_FILE}" \
        && grep -Fq '"updatesPerSecond":120' "${HEALTH_FILE}" \
        && grep -Fq '"bufferSeconds":1.1' "${HEALTH_FILE}" \
        && grep -Fq '"analysisFrames":256' "${HEALTH_FILE}" \
        && grep -Fq '"historySeconds":30.0' "${HEALTH_FILE}" \
        && curl -fsS --max-time 5 http://127.0.0.1:8767/history > "${HISTORY_FILE}" \
        && grep -Fq '"items":[[' "${HISTORY_FILE}"; then
        ready=1
        break
    fi
    sleep 0.25
done

if [[ ${ready} -ne 1 ]]; then
    cat "${HEALTH_FILE}" >&2 || true
    journalctl -u rc-vu.service -n 30 --no-pager >&2 || true
    exit 1
fi

nginx -t
systemctl reload nginx
curl -fsS --max-time 5 https://live.radiocrash.net/vu/history > "${HISTORY_FILE}"
grep -Fq '"items":[[' "${HISTORY_FILE}"

SUCCESS=1
cat "${HEALTH_FILE}"
echo
echo "Adaptive Safari VU v4 backend is active with 30 seconds of history."
echo "Program backup: ${APP_BACKUP}"
echo "Service backup: ${SERVICE_BACKUP}"
echo "Nginx backup: ${NGINX_BACKUP}"
