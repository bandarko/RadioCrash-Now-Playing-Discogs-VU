#!/usr/bin/env bash
set -Eeuo pipefail

TARGET_RAW="${1:-}"
SERVICE_TARGET="/etc/systemd/system/rc-vu.service"
BACKUP_DIR="/var/backups/radiocrash-vu"
STAMP="$(date +%Y%m%d-%H%M%S)"
SUCCESS=0

if [[ ! "${TARGET_RAW}" =~ ^(30|60|90|120)$ ]]; then
    echo "Usage: sudo $0 30|60|90|120" >&2
    exit 1
fi

SERVICE_BACKUP="${BACKUP_DIR}/rc-vu.service.before-rate-${TARGET_RAW}.${STAMP}"
SERVICE_CANDIDATE="$(mktemp /tmp/rc-vu-service.XXXXXX)"
HEALTH_FILE="$(mktemp /tmp/rc-vu-health.XXXXXX)"

cleanup() {
    rm -f "${SERVICE_CANDIDATE}" "${HEALTH_FILE}"
}

rollback() {
    local exit_code=$?
    if [[ ${SUCCESS} -eq 0 && -f "${SERVICE_BACKUP}" ]]; then
        echo "Validation failed; restoring the previous VU update rate..." >&2
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
    echo "Run this script with sudo." >&2
    exit 1
fi

[[ -f "${SERVICE_TARGET}" ]] || {
    echo "Missing ${SERVICE_TARGET}." >&2
    exit 1
}

if [[ $(grep -c '^Environment=RC_VU_UPDATES_PER_SECOND=' "${SERVICE_TARGET}") -ne 1 ]]; then
    echo "Expected exactly one RC_VU_UPDATES_PER_SECOND setting." >&2
    exit 1
fi

grep -Fqx 'Environment=RC_VU_BUFFER_SECONDS=1.10' "${SERVICE_TARGET}"
grep -Fqx 'Environment=RC_VU_ANALYSIS_FRAMES=256' "${SERVICE_TARGET}"

mkdir -p "${BACKUP_DIR}"
install -o root -g root -m 0644 "${SERVICE_TARGET}" "${SERVICE_BACKUP}"
sed "s/^Environment=RC_VU_UPDATES_PER_SECOND=.*/Environment=RC_VU_UPDATES_PER_SECOND=${TARGET_RAW}/" \
    "${SERVICE_TARGET}" > "${SERVICE_CANDIDATE}"
grep -Fqx "Environment=RC_VU_UPDATES_PER_SECOND=${TARGET_RAW}" "${SERVICE_CANDIDATE}"
install -o root -g root -m 0644 "${SERVICE_CANDIDATE}" "${SERVICE_TARGET}"

systemctl daemon-reload
systemctl restart rc-vu.service

ready=0
for _attempt in $(seq 1 48); do
    if curl -fsS --max-time 2 http://127.0.0.1:8767/health > "${HEALTH_FILE}" \
        && grep -Fq '"online":true' "${HEALTH_FILE}" \
        && grep -Fq "\"updatesPerSecond\":${TARGET_RAW}" "${HEALTH_FILE}" \
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
echo "Safari VU now receives ${TARGET_RAW} real measurements/s; the buffer remains 1.10 s."
echo "Return to 60 Hz: sudo $0 60"
echo "Previous service backup: ${SERVICE_BACKUP}"
