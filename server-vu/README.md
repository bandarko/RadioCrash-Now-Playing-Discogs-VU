# Archived server-side Safari VU experiment

> **Status: retired and not deployed.** The production service and Nginx integration were removed on 2 October 2026. The active Safari implementation is the frontend visual fallback in `now-playing-discogs-vu.js`.

This directory preserves the server analyser experiment for engineering history. It opened one local Icecast/Shoutcast connection, decoded stereo PCM with FFmpeg and exposed numeric RMS/peak levels through HTTP/SSE. Later versions kept timestamped history so the Safari client could attempt to follow its playback buffer.

The measurements were real, but the server analyser and Safari's audible player did not share one playback clock. Safari's variable network/decoder buffer made reliable listener-side synchronization impossible. The extra service, FFmpeg process, history memory, SSE connections and Nginx routes were therefore not justified for production.

## Archived files

- `rc_vu_server.py` — FFmpeg reader and numeric level server
- `rc-vu.service` — systemd unit
- `nginx-radiocrash-vu.conf` — retired public routes
- `deploy.sh`, upgrade and tuning scripts — historical deployment tooling
- `rollback.sh` — rollback for the original Nginx integration
- `uninstall.sh` — final guarded removal procedure

## Removal performed in production

The uninstall procedure:

1. removed the exact Nginx VU include and validated the resulting configuration;
2. stopped, disabled and removed `rc-vu.service`;
3. removed the service application, Nginx snippet, staging directory and VU backup directory;
4. reloaded systemd and Nginx;
5. verified that the service was inactive and port `8767` was closed.

It intentionally left the shared `ffmpeg` package installed. Nginx and Icecast remained active after removal.

Do not run the archived deploy or upgrade scripts on the current production server unless the architecture is deliberately reconsidered and the synchronization limitation has a new, testable solution.
