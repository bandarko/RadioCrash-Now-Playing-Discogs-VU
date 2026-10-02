# Radio Crash server-side Safari VU feed

This service opens one local connection to the existing Shoutcast stream, decodes it with FFmpeg and publishes numeric stereo RMS/peak levels through Server-Sent Events.

It does not record audio, write audio to disk or proxy audio to website visitors.

The service is shared by all Safari listeners. Additional Safari clients add lightweight SSE connections; they do not start additional FFmpeg decoders or audio-source connections.

## Current production configuration

```text
stream:           http://127.0.0.1:8000/live.mp3
listen:           127.0.0.1:8767
sample rate:      44100 Hz stereo
update rate:      120 measurements/second
analysis window:  latest 256 stereo frames
alignment buffer: 1.10 seconds (132 measurements)
history window:   30 seconds (3,600 measurements)
memory limit:     256 MB
CPU quota:        30%
```

Local endpoints:

- `http://127.0.0.1:8767/health`
- `http://127.0.0.1:8767/snapshot`
- `http://127.0.0.1:8767/events`
- `http://127.0.0.1:8767/history`

Public Nginx endpoints:

- `https://live.radiocrash.net/vu/status`
- `https://live.radiocrash.net/vu/events`
- `https://live.radiocrash.net/vu/history`

## Files

- `rc_vu_server.py` — FFmpeg reader, delayed level queue and HTTP/SSE server;
- `rc-vu.service` — hardened systemd service with production parameters;
- `nginx-radiocrash-vu.conf` — no-buffer SSE and status routes;
- `deploy.sh` — guarded first installation including the Nginx snippet;
- `upgrade-v3-3.sh` — guarded upgrade of an existing VU service;
- `upgrade-v4-adaptive.sh` — guarded adaptive-history upgrade including the Nginx route;
- `tune-buffer.sh` — guarded 0.5–2.5 second alignment adjustment with rollback;
- `tune-rate.sh` — guarded 30/60/90/120 Hz update-rate adjustment with rollback;
- `rollback.sh` — rollback of the Nginx integration created by `deploy.sh`.

The Nginx snippet uses the existing `$cors_allow` variable from the Radio Crash stream virtual host. Verify that mapping before using the snippet on another server.

The checked-in systemd unit is production-specific: it uses the `banadmin` account and `/opt/radiocrash-vu`. Change the unit, staging paths and ownership deliberately if deploying on another host.

## Prerequisite

Ubuntu package:

```bash
sudo apt-get install --no-install-recommends -y ffmpeg
```

Do not reboot only because the package installer reports a newer kernel; schedule host reboots separately.

## First installation

Copy this directory to `/home/banadmin/rc-vu-staging`, then run:

```bash
sudo /home/banadmin/rc-vu-staging/deploy.sh
```

The deploy script validates prerequisites and Python syntax, backs up the existing Nginx configuration, verifies port 8767, installs the files, starts only `rc-vu.service`, checks health, validates Nginx and reloads Nginx.

## Upgrade an existing installation

```bash
sudo /home/banadmin/rc-vu-staging/upgrade-v4-adaptive.sh
```

The upgrade script backs up the installed Python program, systemd unit and Nginx snippet. It restarts only `rc-vu.service`, validates and reloads Nginx, verifies the exact 120/1.10/256/30 configuration and restores all three previous files automatically if validation fails. It does not restart Shoutcast or the host.

Two initial `curl: (7)` messages can occur while systemd is replacing the old process. The final JSON health response and success line are authoritative.

## Verification

```bash
curl -fsS https://live.radiocrash.net/vu/status
systemctl --no-pager --full status rc-vu.service
```

The health JSON must include:

```json
{"online":true,"updatesPerSecond":120,"bufferSeconds":1.1,"analysisFrames":256,"queueDepth":132,"historySeconds":30.0,"historyDepth":3600}
```

Other live level and process fields will vary.

Useful host-side diagnostics:

```bash
journalctl -u rc-vu.service -n 50 --no-pager
ps -C python3,ffmpeg -o pid,pcpu,pmem,rss,etime,cmd --sort=-pcpu
ss -ltnp 'sport = :8767'
```

An empty `lastError`, a low `ageMs` and a continuously increasing `seq` indicate a healthy analyser loop.

## Adaptive alignment

The 1.10-second queue is the server's base delay. Safari v4 measures its own current audio buffer and selects the corresponding timestamped measurement from `/vu/history`. The client therefore adapts when Safari changes its playback buffer; the server base delay normally does not need location- or connection-specific tuning.

The `/history` payload keeps 30 seconds / 3,600 compact `[seq, serverTime, rmsDbL, rmsDbR]` entries in memory. It does not store audio and is fetched only when Safari playback starts.

### Base-delay tuning

The production base value was calibrated on 26 September 2026 and retained by v4. Change it only if the server analyser itself is shown to have a stable timing error; do not use it to compensate for Safari's variable browser buffer.

For a controlled future adjustment:

```bash
sudo /home/banadmin/rc-vu-staging/tune-buffer.sh 1.10
```

The script accepts 0.5–2.5 seconds, backs up the active service unit, restarts only `rc-vu.service`, verifies the requested value and automatically restores the previous unit on failure.

## Response-rate tuning

The accepted 26 September 2026 configuration uses 120 measurements/s. This captures short peaks at the same cadence as the local Chrome/Brave analyser on the tested ProMotion display. Safari and Chrome were judged visually equivalent after this change.

```bash
sudo /home/banadmin/rc-vu-staging/tune-rate.sh 120
```

The script accepts 30, 60, 90 or 120, preserves the 1.10-second buffer and 256-frame analysis, backs up the active unit and rolls back automatically on failure. Returning to the former rate is `sudo /home/banadmin/rc-vu-staging/tune-rate.sh 60`.

## First-install rollback

```bash
sudo /home/banadmin/rc-vu-staging/rollback.sh
```

This restores the Nginx file saved by the most recent `deploy.sh`, validates and reloads Nginx, and disables the VU service. The upgrade script has its own automatic service rollback.

## Failure isolation

- `online: false`: inspect `lastError`, the service journal and local access to port 8000.
- Public `/vu/status` fails but local `/health` works: inspect the Nginx include and CORS mapping.
- Levels work but Safari audio is silent: investigate the browser player separately; the numeric feed and browser audio are different connections.
- Safari timing changes after a browser update: confirm `historyDepth: 3600`, the public `/vu/history` route and the client's `server-adaptive` mode before changing the base delay.
- Repeated Stop/Play breaks audio: verify that the deployed v4 client still unloads the existing Safari SoundManager stream on Stop.

Do not delete package-manager lock files, restart the entire host or restart unrelated streaming services as a first response to a VU-only failure.
