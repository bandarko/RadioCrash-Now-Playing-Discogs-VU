# WordPress deployment: complete JavaScript and CSS copies

Use the repository files as complete deployment units. Do not combine fragments from chat messages, old backups or previous versions.

## Before editing production

1. Confirm the public VU endpoint is healthy: `https://live.radiocrash.net/vu/status`.
2. Export or copy the current WordPress record contents as a rollback backup.
3. Keep the JavaScript and CSS records separate.
4. Do not paste `<script>` or `<style>` wrapper tags; the Custom CSS & JS plugin adds them.

The WordPress record titles are intentionally shown in Croatian because these are their exact production names.

## JavaScript

WordPress location:

**Custom CSS & JS → All Custom Code → `JS 1 za Svira sada + Discogs + VU`**

Deployment procedure:

1. Open the existing record.
2. Select its complete contents.
3. Replace everything with the complete contents of `now-playing-discogs-vu.js`.
4. Save or publish the record.
5. Purge any page/plugin cache that serves stale inline custom code.
6. Hard-refresh the production page.

The file contains three integrated features:

- Now Playing text and links;
- Discogs cover/release lookup through the WordPress proxy;
- hybrid real stereo VU v3.5.

Important VU invariants:

- Chrome, Firefox and Brave analyse only the existing SoundManager2 audio element.
- Safari receives real numeric L/R levels from `https://live.radiocrash.net/vu/events`.
- No branch creates a second `Audio` object or starts a second browser audio stream.
- Safari waits for the real `playing` event before opening the level feed.
- Safari uses 120 measurements/s, the latest 256 stereo frames and a calibrated 1.10-second server delay.
- Attack is immediate; decay is normalized by elapsed time.
- Safari Stop unloads the stale AAC connection from the existing SoundManager sound so the next Play starts cleanly.
- At 900 px viewport width and below, the VU and its server connection are not initialized.

## CSS

WordPress location:

**Custom CSS & JS → All Custom Code → `CSS 1 za Svira sada + Discogs + logo lijevo + VU`**

Deployment procedure:

1. Open the existing record.
2. Select its complete contents.
3. Replace everything with the complete contents of `now-playing-discogs-vu.css`.
4. Save or publish the record.
5. Purge any relevant cache and hard-refresh the site.

The CSS file is the documented full production copy. It contains the Now Playing badge, desktop cover, header logo positioning and the 18-segment stereo VU styling. The VU is hidden at 900 px and below.

## Production acceptance test

### Safari desktop

1. Press Play and confirm audio starts normally.
2. Confirm the VU remains at zero until playback actually begins.
3. Confirm L and R show real, independently changing levels.
4. Press Stop and confirm both channels return to zero.
5. Repeat Stop/Play at least five times.
6. Confirm there is no skipping, digital clicking, silence or duplicate sound.
7. In the Network panel, confirm there is one browser audio stream and one small `/vu/events` text/event-stream connection.

### Chrome, Firefox and Brave desktop

1. Confirm the existing-player local analyser starts with playback.
2. Confirm the VU stops and clears correctly.
3. Confirm no second audio request is created.

### Mobile and narrow viewport

At 900 px and below, confirm there is no `#rc-vu-mini` element and no request to `/vu/events`.

## Version confirmation

The rendered page source should contain:

```text
hybrid real VU v3.5 time-normalized decay
```

The public status endpoint should include:

```json
{"online":true,"updatesPerSecond":120,"bufferSeconds":1.1,"analysisFrames":256,"queueDepth":132}
```

Other fields in the live JSON are expected to vary.

## Rollback

If a frontend regression appears:

1. Restore the complete previous WordPress record from the backup made before editing.
2. Purge caches and hard-refresh.
3. Verify that the browser again creates only one audio request.

Do not attempt to fix a frontend regression by starting an additional muted player. That reintroduces the duplicate-stream problem this design explicitly avoids.

## Verified production history

- The server-side Safari path was installed on 24 September 2026.
- The rejected v3.4 `requestAnimationFrame` experiment looked slower on the real site and was removed.
- v3.5 normalized decay by elapsed time.
- The server was calibrated to 1.10 seconds and increased from 60 to 120 measurements/s on 26 September 2026.
- The final side-by-side Safari and Chrome comparison was judged visually equivalent.
- The isolated Safari lifecycle harness passed five consecutive Stop/Play cycles without a second browser audio stream.
