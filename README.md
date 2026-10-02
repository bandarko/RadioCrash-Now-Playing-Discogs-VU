# Radio Crash — Now Playing, Discogs and stereo VU

Production WordPress frontend used by **Radio Crash**. It provides the current-song display, Discogs artwork and an 18-segment stereo VU meter without creating a second browser audio stream.

## Current production design

Last updated: 2 October 2026.

| Browser | VU implementation |
| --- | --- |
| Chrome, Firefox, Brave | Real L/R levels from Web Audio attached to the existing SoundManager2 player |
| Safari | Lightweight visual fallback, active only while the existing player is actually playing |
| Mobile / viewport at or below 900 px | VU is not initialized |

The JavaScript version is `local real VU + Safari visual fallback v5.0`.

The Safari fallback is intentional. Safari plays the Radio Crash continuous cross-origin live stream but, in the tested configuration, its `MediaElementAudioSourceNode` exposes silence to `AnalyserNode`. A server-side real-level experiment was built and tested, but Safari's variable playback buffer meant that the server analyser and the listener's audible player did not share a reliable clock. The result could be real program levels yet still appear late or unrelated to the sound. That experiment was retired on 2 October 2026.

The current Safari animation is therefore honest about its role: it is visual activity, not an audio measurement. It never calls the retired `/vu/*` endpoints, creates an `Audio` object or starts another stream. See [Safari VU rationale](docs/WHY-SAFARI-NEEDS-SERVER-VU.md).

## WordPress deployment map

| Repository file | WordPress location | Record title |
| --- | --- | --- |
| `now-playing-discogs-vu.js` | Custom CSS & JS → All Custom Code | `JS 1 za Svira sada + Discogs + VU` |
| `now-playing-discogs-vu.css` | Custom CSS & JS → All Custom Code | `CSS 1 za Svira sada + Discogs + logo lijevo + VU` |
| `discogs-proxy.php` | Snippets → All Snippets | `Discogs` |

Replace the complete JavaScript or CSS record; do not mix fragments from different versions. Detailed steps are in [WordPress copy/paste deployment](docs/WORDPRESS-COPY-PASTE.md).

## Important behavior

- All desktop paths use the existing player only.
- Chrome, Firefox and Brave analyse the player's decoded L/R samples locally.
- Safari starts its visual fallback only after the real media element emits `playing` and clears it on Stop.
- On Safari, Stop unloads the paused infinite AAC connection so the next Play starts a fresh connection on the same SoundManager object. This avoids stale-buffer skipping, clicks and silence after repeated Stop/Start cycles.
- The meter has 18 segments per channel and is hidden at 900 px and below.
- The browser calls Discogs only through `/wp-json/rc/v1/discogs`.

## Testing

Run the local harness:

```bash
python3 tests/harness_server.py
```

Open `http://127.0.0.1:8766/tests/hybrid-vu-harness.html?autorun=1` in Safari. A successful test reports `AUTO PASS — 5/5 Safari STOP/START cycles`, confirms that the animation advances, that Stop releases the stale stream exactly once, and that no server VU connection is opened.

Also test the production page manually in Safari and one Chromium browser. Confirm one audible stream, clean repeated Stop/Start behavior, zero LEDs while stopped, real L/R motion in Chromium and no `/vu/` network requests in Safari.

## Repository layout

- `now-playing-discogs-vu.js` — complete production JavaScript
- `now-playing-discogs-vu.css` — complete production CSS
- `docs/` — deployment, rationale, operations and test history
- `tests/` — local Safari lifecycle harness and historical diagnostics
- `server-vu/` — archived source from the retired server-side experiment plus its uninstall script; not deployed

## Retired server experiment

The production `rc-vu.service`, port `8767`, Nginx `/vu/` routes, `/opt/radiocrash-vu`, staging directory and VU backups were removed on 2 October 2026. Nginx and Icecast remained active. The shared `ffmpeg` package was intentionally retained because it is a normal system dependency and may be used elsewhere.

The archived implementation remains in Git for engineering history and reproducibility. Do not deploy it as part of the current frontend.

## Security

Never commit tokens, passwords, private keys, database dumps or server backups. The public repository copy of the Discogs proxy reads `RC_DISCOGS_TOKEN` from the environment; browser code never receives that token.
