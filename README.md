# RadioCrash — Now Playing + Discogs + real stereo VU

Production WordPress frontend and server-side Safari VU feed used by **Radio Crash**.

The repository contains one integrated system:

- current-song display and cover artwork;
- Discogs metadata through the Radio Crash WordPress proxy;
- an 18-segment stereo VU meter;
- the Safari/WebKit numeric level service;
- deployment, rollback and test documentation.

## Current production state

Verified on 24 September 2026:

| Component | Current version / configuration |
| --- | --- |
| WordPress JavaScript | `hybrid real VU v3.3 Safari live-match` |
| WordPress CSS | documented production styling |
| Chrome / Firefox / Brave | local Web Audio analyser, `fftSize=256` |
| Safari | real numeric stereo levels over SSE |
| Server update rate | 60 measurements per second |
| Server analysis window | latest 256 stereo frames |
| Alignment buffer | 1.5 seconds |
| VU layout | 18 LED segments per channel; disabled at 900 px and below |

The short-lived v3.4 `requestAnimationFrame` display-sync experiment was rejected after production testing because its movement looked slower in Safari. The repository therefore intentionally contains the better v3.3 direct-SSE renderer.

## Architecture

### Chrome, Firefox and Brave

The VU connects `AnalyserNode` objects to the `HTMLAudioElement` already owned by the Vice theme's SoundManager2 player. It does not create another player or request another audio stream.

### Safari

Safari/WebKit reproduces the live AAC stream but returns zeroes from the browser-side `MediaElementAudioSourceNode` analyser. The server therefore runs one FFmpeg decoder against the existing local Shoutcast stream and publishes only compact L/R RMS and peak numbers.

Safari opens:

```text
https://live.radiocrash.net/vu/events
```

only after the real player emits `playing`, and closes it on Stop. The SSE endpoint is numeric data, not audio.

The v3.3 server analyses the latest 256 stereo frames 60 times per second. The browser uses the same RMS-to-LED calculation and gain (`24`) as the local Chrome/Firefox/Brave implementation.

### Safari Stop/Start fix

The Vice theme pauses its infinite AAC SoundManager stream on Stop. Replaying that stale paused object in Safari can produce skipping, digital artefacts or silence after repeated Stop/Start cycles.

On Safari only, v3.3 calls `unload()` on the existing SoundManager sound after Stop. The next Play reloads a fresh live connection on the same player object. No additional `Audio` object or browser audio stream is created.

## Repository structure

```text
.
├── README.md
├── SOURCE-INTEGRITY.md
├── discogs-proxy.php
├── now-playing-discogs-vu.js
├── now-playing-discogs-vu.css
├── docs/
│   ├── SAFARI-TEST-REPORT.md
│   ├── VU-OPERATIONS.md
│   └── WORDPRESS-COPY-PASTE.md
├── server-vu/
│   ├── README.md
│   ├── deploy.sh
│   ├── nginx-radiocrash-vu.conf
│   ├── rc-vu.service
│   ├── rc_vu_server.py
│   ├── rollback.sh
│   └── upgrade-v3-3.sh
└── tests/
    ├── harness_server.py
    └── hybrid-vu-harness.html
```

## WordPress deployment map

| Repository file | WordPress admin location | Exact record title | State |
| --- | --- | --- | --- |
| `now-playing-discogs-vu.js` | Custom CSS & JS → All Custom Code | `JS 1 za Svira sada + Discogs + VU` | active |
| `now-playing-discogs-vu.css` | Custom CSS & JS → All Custom Code | `CSS 1 za Svira sada + Discogs + logo lijevo + VU` | active |
| `discogs-proxy.php` | Snippets → All Snippets | `Discogs` | active sanitized repository copy |

Replace the complete contents of the corresponding WordPress frontend record; do not combine partial versions. See [`docs/WORDPRESS-COPY-PASTE.md`](docs/WORDPRESS-COPY-PASTE.md).

## Server deployment

The current production service runs as:

```text
/opt/radiocrash-vu/rc_vu_server.py
/etc/systemd/system/rc-vu.service
```

Public endpoints:

```text
https://live.radiocrash.net/vu/status
https://live.radiocrash.net/vu/events
```

The service is bound to `127.0.0.1:8767`; Nginx exposes only the two public VU routes.

For an existing installation staged at `/home/banadmin/rc-vu-staging`:

```bash
sudo /home/banadmin/rc-vu-staging/upgrade-v3-3.sh
```

The upgrade script:

- validates the Python and systemd sources;
- backs up the installed program and service unit;
- restarts only `rc-vu.service`;
- verifies 60 Hz, 1.5 seconds and 256-frame analysis;
- automatically restores the previous version if validation fails.

It does not restart Nginx, Shoutcast or the host. See [`server-vu/README.md`](server-vu/README.md) for first installation and rollback details.

## Verified tests

The final isolated Safari 26.6.2 regression test completed five consecutive Stop/Play cycles:

- five SSE connections;
- 50 real stereo level messages;
- five releases of the paused SoundManager stream;
- separate L/R LED values;
- zero SSE errors;
- 0/0 LEDs and a closed SSE connection after every Stop.

The staging server produced 59.99 updates/s. During that test Python used approximately 2.6% CPU and 18.7 MB RSS; FFmpeg used approximately 1.2% CPU and 47.9 MB RSS.

The full Safari investigation and version history are in [`docs/SAFARI-TEST-REPORT.md`](docs/SAFARI-TEST-REPORT.md).

To repeat the isolated Safari regression test locally:

```bash
python3 tests/harness_server.py
```

Then open `http://127.0.0.1:8766/tests/hybrid-vu-harness.html?autorun=1` in Safari. A successful run reports `AUTO PASS — 5/5 Safari STOP/START ciklusa`. The harness uses a mock of the existing SoundManager player lifecycle and the real public numeric VU feed; it never starts a second browser audio stream.

## Discogs proxy

The browser calls `/wp-json/rc/v1/discogs`; it never calls `api.discogs.com` directly. The repository copy expects the credential through the `RC_DISCOGS_TOKEN` environment variable and deliberately excludes the production secret.

The production `Discogs` snippet supplies cover and release data to the web frontend and mobile consumers. The separate `Android RC app last 10 songs` snippet supplies song history to the Android and iOS apps.

## Security and source policy

- Never commit Discogs tokens, WordPress credentials, private keys, database dumps, backups or runtime caches.
- Keep browser audio strictly “existing player only.”
- Keep the server feed numeric-only; do not proxy audio through `/vu/events`.
- Treat `now-playing-discogs-vu.js`, `now-playing-discogs-vu.css` and `server-vu/` as synchronized production sources.
- Test Safari Stop/Start repeatedly before deploying player lifecycle changes.

See [`SOURCE-INTEGRITY.md`](SOURCE-INTEGRITY.md).

## Radio Crash

Independent internet radio project, online since 2011 with roots going back to 1986.

**Website:** [radiocrash.net](https://radiocrash.net/)
