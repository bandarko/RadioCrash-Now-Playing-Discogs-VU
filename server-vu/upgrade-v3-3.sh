#!/usr/bin/env bash
set -Eeuo pipefail

SOURCE_DIR="/home/banadmin/rc-vu-staging"
APP_DIR="/opt/radiocrash-vu"
SERVICE_TARGET="/etc/systemd/system/rc-vu.service"
BACKUP_DIR="/var/backups/radiocrash-vu"
STAMP="$(date +%Y%m%d-%H%M%S)"
APP_BACKUP="${BACKUP_DIR}/rc_vu_server.py.${STAMP}"
SERVICE_BACKUP="${BACKUP_DIR}/rc-vu.service.${STAMP}"
HEALTH_FILE="$(mktemp /tmp/rc-vu-health.XXXXXX)"
SUCCESS=0

cleanup() {
    rm -f "${HEALTH_FILE}"
}

rollback() {
    local exit_code=$?
    if [[ ${SUCCESS} -eq 0 && -f "${APP_BACKUP}" && -f "${SERVICE_BACKUP}" ]]; then
        echo "Greška; vraćam prethodnu VU verziju..." >&2
        install -o root -g root -m 0755 "${APP_BACKUP}" "${APP_DIR}/rc_vu_server.py"
        install -o root -g root -m 0644 "${SERVICE_BACKUP}" "${SERVICE_TARGET}"
        systemctl daemon-reload
        systemctl restart rc-vu.service || true
    fi
    cleanup
    exit "${exit_code}"
}

trap rollback ERR INT TERM
trap cleanup EXIT

if [[ ${EUID} -ne 0 ]]; then
    echo "Pokreni ovu skriptu sa sudo." >&2
    exit 1
fi

for source_file in "${SOURCE_DIR}/rc_vu_server.py" "${SOURCE_DIR}/rc-vu.service"; do
    [[ -f "${source_file}" ]] || { echo "Nedostaje ${source_file}" >&2; exit 1; }
done

python3 -m py_compile "${SOURCE_DIR}/rc_vu_server.py"
grep -Fq 'Environment=RC_VU_UPDATES_PER_SECOND=60' "${SOURCE_DIR}/rc-vu.service"
grep -Fq 'Environment=RC_VU_BUFFER_SECONDS=1.10' "${SOURCE_DIR}/rc-vu.service"
grep -Fq 'Environment=RC_VU_ANALYSIS_FRAMES=256' "${SOURCE_DIR}/rc-vu.service"

mkdir -p "${BACKUP_DIR}"
install -o root -g root -m 0755 "${APP_DIR}/rc_vu_server.py" "${APP_BACKUP}"
install -o root -g root -m 0644 "${SERVICE_TARGET}" "${SERVICE_BACKUP}"
install -o root -g root -m 0755 "${SOURCE_DIR}/rc_vu_server.py" "${APP_DIR}/rc_vu_server.py"
install -o root -g root -m 0644 "${SOURCE_DIR}/rc-vu.service" "${SERVICE_TARGET}"

systemctl daemon-reload
systemctl restart rc-vu.service

ready=0
for _attempt in $(seq 1 40); do
    if curl -fsS --max-time 2 http://127.0.0.1:8767/health > "${HEALTH_FILE}" \
        && grep -Fq '"online":true' "${HEALTH_FILE}" \
        && grep -Fq '"updatesPerSecond":60' "${HEALTH_FILE}" \
        && grep -Fq '"bufferSeconds":1.1' "${HEALTH_FILE}" \
        && grep -Fq '"analysisFrames":256' "${HEALTH_FILE}"; then
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

SUCCESS=1
cat "${HEALTH_FILE}"
echo
echo "VU v3.3 aktivan: 60 mjerenja/s, 256-frame analiza, buffer 1.10 s."
echo "Backup programa: ${APP_BACKUP}"
echo "Backup servisa: ${SERVICE_BACKUP}"
