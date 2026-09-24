# Radio Crash server-side Safari VU feed

This service opens one local connection to the existing Shoutcast stream, decodes it with FFmpeg and publishes numeric stereo RMS/peak levels through Server-Sent Events.

It does not record audio, write audio to disk or proxy audio to website visitors.

## Current production configuration

```text
stream:           http://127.0.0.1:8000/live.mp3
listen:           127.0.0.1:8767
sample rate:      44100 Hz stereo
update rate:      60 measurements/second
analysis window:  latest 256 stereo frames
alignment buffer: 1.5 seconds
memory limit:     256 MB
CPU quota:        30%
```

Local endpoints:

- `http://127.0.0.1:8767/health`
- `http://127.0.0.1:8767/snapshot`
- `http://127.0.0.1:8767/events`

Public Nginx endpoints:

- `https://live.radiocrash.net/vu/status`
- `https://live.radiocrash.net/vu/events`

## Files

- `rc_vu_server.py` — FFmpeg reader, delayed level queue and HTTP/SSE server;
- `rc-vu.service` — hardened systemd service with production parameters;
- `nginx-radiocrash-vu.conf` — no-buffer SSE and status routes;
- `deploy.sh` — guarded first installation including the Nginx snippet;
- `upgrade-v3-3.sh` — guarded upgrade of an existing VU service;
- `rollback.sh` — rollback of the Nginx integration created by `deploy.sh`.

The Nginx snippet uses the existing `$cors_allow` variable from the Radio Crash stream virtual host. Verify that mapping before using the snippet on another server.

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
sudo /home/banadmin/rc-vu-staging/upgrade-v3-3.sh
```

The upgrade script backs up the installed Python program and systemd unit, restarts only `rc-vu.service`, verifies the exact 60/1.5/256 configuration and restores the previous service automatically if validation fails. It does not change Nginx or Shoutcast.

Two initial `curl: (7)` messages can occur while systemd is replacing the old process. The final JSON health response and success line are authoritative.

## Verification

```bash
curl -fsS https://live.radiocrash.net/vu/status
systemctl --no-pager --full status rc-vu.service
```

The health JSON must include:

```json
{"online":true,"updatesPerSecond":60,"bufferSeconds":1.5,"analysisFrames":256,"queueDepth":90}
```

Other live level and process fields will vary.

## First-install rollback

```bash
sudo /home/banadmin/rc-vu-staging/rollback.sh
```

This restores the Nginx file saved by the most recent `deploy.sh`, validates and reloads Nginx, and disables the VU service. The v3.3 upgrade script has its own automatic service rollback.
