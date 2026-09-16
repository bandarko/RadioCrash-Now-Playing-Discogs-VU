# RadioCrash — Now Playing + Discogs + VU

Production WordPress frontend module used by Radio Crash for the **Now Playing** display, Discogs metadata/artwork integration and the desktop VU meter.

These three parts are intentionally maintained as **one project** because they form one functional component on the Radio Crash website.

## Components

- `now-playing-discogs-vu.js` — frontend logic: current track polling, metadata handling and VU behaviour.
- `now-playing-discogs-vu.css` — production styling for the combined component.
- `discogs-proxy.php` — WordPress/PHP proxy used for Discogs requests.

## WordPress integration

The JavaScript and CSS originate from the production WordPress Custom CSS/JS implementation. The PHP file originates from the production Discogs Code Snippet.

## Configuration

The Discogs access token is **not stored in this repository**. The sanitized PHP source expects it from the `RC_DISCOGS_TOKEN` environment variable.

## Source integrity

Production source files in this repository are preserved byte-for-byte from the recovered Radio Crash source. Formatting, whitespace and legacy implementation details are intentionally retained so this repository can serve as an exact source archive as well as the maintenance repository.

## Security

Do not commit API tokens, WordPress backups, SQL dumps, credentials or runtime data.

## Project

Radio Crash — independent internet radio project.  
Website: `radiocrash.net`
