# Radio Crash VU operations guide

Last updated: 2 October 2026.
Active client: `local real VU + Safari visual fallback v5.0`

## Production components

The active VU is frontend-only and lives in the two WordPress Custom CSS & JS records documented in [WORDPRESS-COPY-PASTE.md](WORDPRESS-COPY-PASTE.md).

- Chrome, Firefox and Brave: real local analyser on the existing player.
- Safari: playback-gated visual fallback.
- Mobile and viewports at or below 900 px: no VU initialization.
- Server-side VU service: retired and removed.

## Routine browser check

1. Open `radiocrash.net` in Safari and a Chromium browser.
2. Press Play and wait for real audio playback.
3. Confirm the Chromium meter shows independently changing real L/R levels.
4. Confirm Safari begins visual movement only when playback begins.
5. Press Stop and confirm both meters clear.
6. Repeat Stop/Play five times in Safari; listen for skipping, clicks or silence.
7. In Safari's Network panel, confirm no `/vu/events`, `/vu/history` or `/vu/status` request exists and only the existing player audio request is active.

## Local automated Safari test

```bash
python3 tests/harness_server.py
```

Open `http://127.0.0.1:8766/tests/hybrid-vu-harness.html?autorun=1` in Safari. The expected result is `AUTO PASS — 5/5 Safari STOP/START cycles`, zero server-feed opens and non-zero fake animation frames while playing.

## Troubleshooting

### VU starts before audio

The Safari branch must depend on the media element's `playing` event, not only on SoundManager's requested play state. Verify that `safariPlaybackReady` remains false until `playing`.

### Safari skips or clicks after Stop/Start

Keep the Safari-only `unload()` cleanup. The Vice theme pauses an infinite AAC connection on Stop; resuming stale compressed data can cause artifacts. The cleanup releases that same player connection and lets the next Play reopen it.

### Chromium VU is zero

Check that `crossOrigin="anonymous"` is set before the stream URL, the stream supplies the required CORS response header, and the VU attaches to SoundManager's existing `currentSound._a`. Never fix this by creating a second player.

### Safari VU looks unrelated to music

That is an inherent limitation of the visual fallback: it is not measuring audio. It should look plausibly active, but it must not be tuned or documented as synchronized. If a visual fallback is no longer desirable, the honest alternative is to hide the VU in Safari.

## Server removal verification

The server experiment was removed on 2 October 2026. A host audit should show:

- `rc-vu.service` inactive or absent;
- no listener on TCP port `8767`;
- no VU Nginx include or `/vu/` route;
- no `/opt/radiocrash-vu`, staging directory or VU backup directory;
- Nginx and Icecast still active.

The shared `ffmpeg` package was intentionally not uninstalled.

The archived scripts under `server-vu/` are historical material. `server-vu/uninstall.sh` is the removal procedure; deployment scripts are not part of the current production design.
