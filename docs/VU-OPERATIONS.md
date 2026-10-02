# Radio Crash hybrid VU v4.0 operations guide

This runbook describes the production layout, routine checks, safe tuning and rollback procedures for the Radio Crash stereo VU meter.

## Production baseline

| Setting | Production value |
| --- | --- |
| Client version | `hybrid real VU v4.0 adaptive sync` |
| LED segments | 18 per channel |
| Server update rate | 120 measurements/s |
| Analysis window | latest 256 stereo frames |
| Server base delay | 1.10 seconds / 132 measurements |
| Numeric history | 30 seconds / 3,600 measurements |
| Browser cutoff | disabled at 900 px and below |

Do not change more than one of the update rate, analysis window, server base delay, history size or client response curve at a time. The v4 adaptive client and production backend were verified on 2 October 2026.

## Code locations

### WordPress

The record titles below are intentionally kept in Croatian because they are the exact identifiers used in the live WordPress administration.

| Purpose | WordPress path | Record title |
| --- | --- | --- |
| JavaScript | Custom CSS & JS → All Custom Code | `JS 1 za Svira sada + Discogs + VU` |
| CSS | Custom CSS & JS → All Custom Code | `CSS 1 za Svira sada + Discogs + logo lijevo + VU` |

The VU is not a separate WordPress plugin. It is the final section of the same JavaScript record that implements the Now Playing and Discogs features.

### Streaming server

```text
/opt/radiocrash-vu/rc_vu_server.py
/etc/systemd/system/rc-vu.service
/home/banadmin/rc-vu-staging/
```

The service listens only on `127.0.0.1:8767`. Nginx exposes the read-only status, SSE and history routes.

## Browser behavior

- Chrome, Firefox and Brave attach Web Audio analysers to the existing SoundManager2 audio element.
- Safari receives real numeric L/R levels from `https://live.radiocrash.net/vu/events` through `EventSource`.
- Safari fetches `https://live.radiocrash.net/vu/history` once when playback starts, measures `buffered.end − currentTime` and selects the timestamped sample that matches the audible position.
- Safari waits for the existing player to emit `playing`; the meter cannot start before audible playback.
- Stop closes the SSE connection, resets the LEDs and unloads the stale Safari AAC connection from the existing SoundManager object.
- No path creates a second `Audio` object, starts another browser audio stream or uses random/fake level animation.
- Level attack is immediate. Decay is normalized by elapsed time, so it does not depend on a browser's rendering frame rate.
- LED classes are changed only when the rounded number of illuminated segments changes.

See [Why Safari needs a server-side VU feed](WHY-SAFARI-NEEDS-SERVER-VU.md) for the technical rationale.

## Routine health check

From any machine:

```bash
curl -fsS https://live.radiocrash.net/vu/status
```

Expected invariant fields:

```json
{
  "online": true,
  "updatesPerSecond": 120,
  "bufferSeconds": 1.1,
  "analysisFrames": 256,
  "queueDepth": 132,
  "historySeconds": 30.0,
  "historyDepth": 3600,
  "lastError": ""
}
```

Fields such as `seq`, levels, `ageMs`, `clients`, `ffmpegPid` and `serverTime` change continuously. An `ageMs` value in the low tens of milliseconds is normal.

On the streaming host:

```bash
systemctl --no-pager --full status rc-vu.service
journalctl -u rc-vu.service -n 50 --no-pager
curl -fsS http://127.0.0.1:8767/health
```

The VU service is independent of the public audio player. A VU failure should be investigated without restarting Nginx, Icecast/Shoutcast or the host unless there is separate evidence that those services are unhealthy.

## Safe update procedure

1. Copy the reviewed server files into `/home/banadmin/rc-vu-staging`.
2. Validate the scripts with `bash -n` and the Python service with `python3 -m py_compile`.
3. Run the guarded upgrade:

```bash
sudo /home/banadmin/rc-vu-staging/upgrade-v4-adaptive.sh
```

The script validates the 120/1.10/256/30 production baseline, backs up the Python program, systemd unit and Nginx snippet, restarts only `rc-vu.service`, validates and reloads Nginx, verifies local and public history, and restores all previous files automatically if validation fails.

## Controlled tuning

### Server base delay

```bash
sudo /home/banadmin/rc-vu-staging/tune-buffer.sh 1.10
```

Accepted range: 0.5–2.5 seconds. This value is already subtracted from Safari's measured player buffer by v4. Treat it as an analyser-path base delay, not a location-specific manual sync control.

### Measurement rate

```bash
sudo /home/banadmin/rc-vu-staging/tune-rate.sh 120
```

Accepted values: 30, 60, 90 and 120 measurements/s. The script preserves the 1.10-second delay and 256-frame analysis window. To return to the former rate:

```bash
sudo /home/banadmin/rc-vu-staging/tune-rate.sh 60
```

Both tuning scripts back up the active systemd unit, restart only the VU service, validate the requested configuration and automatically roll back on failure.

## Browser acceptance checklist

Test on the production page after every client or lifecycle change:

1. Safari Play: audio starts normally and the VU begins only after audible playback.
2. Safari Stop: LEDs return to 0/0 and the SSE connection closes.
3. Safari Stop/Play repeated at least five times: no skipping, digital artifacts, silence or duplicate sound.
4. Safari stereo: L and R can show different values.
5. Chrome, Firefox and Brave: the local existing-player analyser still works.
6. Network panel: exactly one browser audio stream, one `/vu/events` text/event-stream connection and one `/vu/history` JSON request per playback start.
7. Safari adaptive state: history is loaded and the measured buffer/additional delay are finite.
8. Mobile or viewport at 900 px and below: no VU element and no VU network requests.

The isolated Safari harness can be run with:

```bash
python3 tests/harness_server.py
```

Then open `http://127.0.0.1:8766/tests/hybrid-vu-harness.html?autorun=1` in Safari. A successful run reports five completed Stop/Play cycles with no SSE or lifecycle failures.

## Troubleshooting

### Status reports `online: false`

Check `lastError`, the service journal and whether FFmpeg can read `http://127.0.0.1:8000/live.mp3`. Do not delete lock files or restart unrelated services as a first response.

### Safari VU starts before sound

Confirm the active WordPress JavaScript is the complete v4 file and that the Safari branch opens the feed only after `playing`, not on the initial `play` request.

### Safari movement is delayed but otherwise correct

Check `historySeconds: 30.0`, `historyDepth: 3600` and that `https://live.radiocrash.net/vu/history` returns HTTP 200. In client debug state, verify `historyReady`, `bufferAheadSeconds`, `extraDelaySeconds` and `serverSamples`. Do not tune the 1.10-second base delay to compensate for a variable browser buffer.

### Safari looks less responsive than Chrome

Check for `updatesPerSecond: 120` and `analysisFrames: 256`. Do not restore the rejected Safari `requestAnimationFrame` renderer; it looked slower in production testing.

### Repeated Stop/Play causes skipping or silence

Verify that Safari Stop still calls `unload()` on the existing SoundManager sound. Do not work around this by creating another player or another audio stream.

### VU works but audio does not

Treat this as a player or stream issue. The numeric VU feed can remain healthy while the browser audio path is stalled because they are separate connections.
