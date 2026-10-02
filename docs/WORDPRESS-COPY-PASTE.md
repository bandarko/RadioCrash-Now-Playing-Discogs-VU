# WordPress deployment: JavaScript and CSS

Use the repository files as complete deployment units. Do not combine fragments from chat messages, backups or older versions. Do not add `<script>` or `<style>` wrappers; the WordPress plugin supplies them.

## JavaScript

WordPress path: **Custom CSS & JS → All Custom Code → `JS 1 za Svira sada + Discogs + VU`**

1. Back up the current record.
2. Select its complete contents.
3. Paste the complete contents of `now-playing-discogs-vu.js`.
4. Save/publish, purge relevant caches and hard-refresh the page.

The version banner must contain:

```text
LOCAL REAL + SAFARI VISUAL FALLBACK v5.0
```

The file includes Now Playing, Discogs proxy integration and the VU. Chrome, Firefox and Brave use the existing player's real Web Audio samples. Safari uses a visual fallback only while the existing player is playing. No branch creates a second `Audio` object. The Safari branch makes no request to the retired `/vu/` endpoints.

## CSS

WordPress path: **Custom CSS & JS → All Custom Code → `CSS 1 za Svira sada + Discogs + logo lijevo + VU`**

1. Back up the current record.
2. Select its complete contents.
3. Paste the complete contents of `now-playing-discogs-vu.css`.
4. Save/publish, purge relevant caches and hard-refresh the page.

The CSS contains the Now Playing badge, desktop cover, logo placement and 18-segment stereo VU styling. It hides the VU at 900 px and below.

## Acceptance test

### Safari desktop

1. Press Play and confirm the meter remains at zero until audio actually starts.
2. Confirm visual movement begins during playback.
3. Press Stop and confirm both channels return to zero.
4. Repeat Stop/Play at least five times and confirm there is no skipping, digital clicking or silence.
5. Confirm the Network panel contains no `/vu/` request and no second audio stream.

### Chrome, Firefox and Brave desktop

1. Confirm the existing-player analyser produces independent real L/R movement.
2. Confirm Stop clears the meter.
3. Confirm no second audio request exists.

### Mobile / narrow viewport

At 900 px and below, confirm there is no `#rc-vu-mini` element.

## Rollback

Restore the complete saved WordPress record, purge caches and hard-refresh. Never work around a regression by adding a muted second player; that recreates the duplicate-audio problem.
