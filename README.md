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

## WordPress deployment map

The WordPress screenshots supplied on 2026-09-16 identify two frontend records and one server-side snippet:

| Repository file | WordPress admin location | Exact record title | Type / shown state |
| --- | --- | --- | --- |
| `now-playing-discogs-vu.js` | Custom CSS & JS → All Custom Code | `JS 1 za Svira sada + Discogs + VU` | JavaScript / published |
| `now-playing-discogs-vu.css` | Custom CSS & JS → All Custom Code | `CSS 1 za Svira sada + Discogs + logo lijevo + VU` | CSS / published |
| `discogs-proxy.php` | Snippets → All Snippets (Code Snippets) | `Discogs` | PHP / active, priority 10 |

Update the corresponding existing records. The PHP file is a Code Snippets body, not a standalone installable plugin. Frontend placement/loading settings and PHP execution scope are not visible in the list screenshots and must be checked in the existing editors.

### Relationship to Radio Crash Reactions

The production setup confirmed by the owner and the supplied screenshot uses **Radio Crash Reactions 0.4.5** together with the active **`Discogs`** and **`Android RC app last 10 songs`** PHP snippets.

The production `Discogs` snippet serves all three clients: Android, iOS, and this web frontend. On the website it supplies cover artwork and release information for the Now Playing display. The production `Android RC app last 10 songs` snippet supplies song history to both mobile apps.

The [Reactions repository](https://github.com/bandarko/RadioCrash-Reactions-WordPress) also contains later additions labelled 0.4.7 that place `/discogs` and `/history` inside the plugin source. Those additions preserve the existing reactions implementation. The installed production layout remains version 0.4.5 with the two separate active snippets shown above.

## Production source policy

Production PHP, JavaScript and CSS are kept without formatting-only cleanup or modernization. Documentation such as this README may be improved independently. Functional source changes should be deliberate and tested against the live Radio Crash integration.

## Security

Never commit Discogs tokens, WordPress credentials, SQL/database dumps, backups, runtime caches or other secrets.

## Radio Crash

Independent internet radio project, online since 2011 with roots going back to 1986.

**Website:** `radiocrash.net`
