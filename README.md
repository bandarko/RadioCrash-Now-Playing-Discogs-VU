# RadioCrash — Now Playing + Discogs + VU

Production WordPress frontend system used by **Radio Crash** for the **Now Playing** display, Discogs metadata/artwork integration and the desktop VU meter.

These parts intentionally live in **one repository** because on `radiocrash.net` they form one functional component rather than three independent projects.

## Repository structure

```text
.
├── README.md
├── discogs-proxy.php             # WordPress REST proxy for Discogs
├── now-playing-discogs-vu.js     # Now Playing, metadata and VU frontend logic
└── now-playing-discogs-vu.css    # Production styling
```

## WordPress origin

The JavaScript and CSS were recovered from the production WordPress Custom CSS/JS implementation **Svira sada + Discogs + VU**. The PHP endpoint was recovered from the production **Discogs** Code Snippet.

## Discogs proxy

The browser talks to the Radio Crash WordPress REST endpoint rather than directly exposing the Discogs credential. The repository version expects the Discogs token through the `RC_DISCOGS_TOKEN` environment variable.

No API token belongs in Git history.

## VU meter

The VU meter in this repository is the production VU implementation that belongs to the Now Playing system. It is not the old `RC VU Test Detector` diagnostic snippet.

## Production source policy

Production PHP, JavaScript and CSS are kept without formatting-only cleanup or modernization. Documentation such as this README may be improved independently. Functional source changes should be deliberate and tested against the live Radio Crash integration.

## Security

Never commit Discogs tokens, WordPress credentials, SQL/database dumps, backups, runtime caches or other secrets.

## Radio Crash

Independent internet radio project, online since 2011 with roots going back to 1986.

**Website:** `radiocrash.net`
