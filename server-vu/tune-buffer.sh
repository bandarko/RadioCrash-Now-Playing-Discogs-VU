#!/usr/bin/env bash
set -Eeuo pipefail

TARGET_RAW="${1:-}"
SERVICE_TARGET="/etc/systemd/system/rc-vu.service"
BACKUP_DIR="/var/backups/radiocrash-vu"
STAMP="$(date +%Y%m%d-%H%M%S)"
SUCCESS=0

if ! awk -v value="${TARGET_RAW}" 'BEGIN {
    exit !(value ~ /^[0-9]+([.][0-9]+)?$/ && value >= 0.5 && value <= 2.5)
}'; then
    echo "Upotreba: sudo $0 BUFFER_SEKUNDE (dopušteno 0.5–2.5)" >&2
    exit 1
fi

TARGET_SERVICE="$(awk -v value="${TARGET_RAW}" 'BEGIN { printf "%.2f", value }')"
TARGET_JSON="$(awk -v value="${TARGET_RAW}" 'BEGIN { printf "%g", value }')"
TARGET_SLUG="${TARGET_SERVICE/./-}"
SERVICE_BACKUP="${BACKUP_DIR}/rc-vu.service.before-buffer-${TARGET_SLUG}.${STAMP}"
SERVICE_CANDIDATE="$(mktemp /tmp/rc-vu-service.XXXXXX)"
HEALTH_FILE="$(mktemp /tmp/rc-vu-health.XXXXXX)"

cleanup() {
    rm -f "${SERVICE_CANDIDATE}" "${HEALTH_FILE}"
}

rollback() {
    local exit_code=$?
    if [[ ${SUCCESS} -eq 0 && -f "${SERVICE_BACKUP}" ]]; then
        echo "Provjera nije prošla; vraćam prethodni VU buffer..." >&2
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

[[ -f "${SERVICE_TARGET}" ]] || {
    echo "Nedostaje ${SERVICE_TARGET}." >&2
    exit 1
}

if [[ $(grep -c '^Environment=RC_VU_BUFFER_SECONDS=' "${SERVICE_TARGET}") -ne 1 ]]; then
    echo "Očekivana je točno jedna RC_VU_BUFFER_SECONDS postavka." >&2
    exit 1
fi

mkdir -p "${BACKUP_DIR}"
install -o root -g root -m 0644 "${SERVICE_TARGET}" "${SERVICE_BACKUP}"
sed "s/^Environment=RC_VU_BUFFER_SECONDS=.*/Environment=RC_VU_BUFFER_SECONDS=${TARGET_SERVICE}/" \
    "${SERVICE_TARGET}" > "${SERVICE_CANDIDATE}"
grep -Fqx "Environment=RC_VU_BUFFER_SECONDS=${TARGET_SERVICE}" "${SERVICE_CANDIDATE}"
install -o root -g root -m 0644 "${SERVICE_CANDIDATE}" "${SERVICE_TARGET}"

systemctl daemon-reload
systemctl restart rc-vu.service

ready=0
for _attempt in $(seq 1 40); do
    if curl -fsS --max-time 2 http://127.0.0.1:8767/health > "${HEALTH_FILE}" \
        && grep -Fq '"online":true' "${HEALTH_FILE}" \
        && grep -Fq '"updatesPerSecond":60' "${HEALTH_FILE}" \
        && grep -Fq "\"bufferSeconds\":${TARGET_JSON}" "${HEALTH_FILE}" \
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
echo "Safari VU buffer je ${TARGET_SERVICE} s."
echo "Backup prethodnog servisa: ${SERVICE_BACKUP}"
