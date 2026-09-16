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

The repository PHP is deliberately not byte-for-byte identical to the production snippet: production currently keeps the credential inline, while this repository removes that secret from source and reads it from the environment. The route and response behavior are otherwise the same. The production credential was inspected only to confirm configuration and was not copied.

No API token belongs in Git history.

## VU meter

The VU meter in this repository is the production VU implementation that belongs to the Now Playing system. It is not the old `RC VU Test Detector` diagnostic snippet.

## WordPress deployment map

Read-only inspection of WordPress on 2026-09-16 confirmed two frontend records and one server-side snippet:

| Repository file | WordPress admin location | Exact record title | Type / shown state |
| --- | --- | --- | --- |
| `now-playing-discogs-vu.js` | Custom CSS & JS → All Custom Code | `JS 1 za Svira sada + Discogs + VU` | JavaScript / active; exact production content |
| `now-playing-discogs-vu.css` | Custom CSS & JS → All Custom Code | `CSS 1 za Svira sada + Discogs + logo lijevo + VU` | CSS / active; exact production content |
| `discogs-proxy.php` | Snippets → All Snippets (Code Snippets) | `Discogs` | PHP / active; sanitized repository copy |

Both frontend records load internally in the page `<head>`, on the entire public frontend, for all website URLs, at priority 5. The PHP snippet runs everywhere at priority 10. Update the corresponding existing records; the PHP file is a Code Snippets body, not a standalone installable plugin.

### Relationship to Radio Crash Reactions

The production setup confirmed by the owner and the supplied screenshot uses **Radio Crash Reactions 0.4.5** together with the active **`Discogs`** and **`Android RC app last 10 songs`** PHP snippets.

The production `Discogs` snippet serves all three clients: Android, iOS, and this web frontend. On the website it supplies cover artwork and release information for the Now Playing display. The production `Android RC app last 10 songs` snippet supplies song history to both mobile apps. These consumers were verified directly in the Android, iOS, and web source.

The [Reactions repository](https://github.com/bandarko/RadioCrash-Reactions-WordPress) contains the actual production plugin version 0.4.5. `/discogs` and `/history` remain separate Code Snippets, matching the installed production layout.

## Production source policy

Production PHP, JavaScript and CSS are kept without formatting-only cleanup or modernization. Documentation such as this README may be improved independently. Functional source changes should be deliberate and tested against the live Radio Crash integration.

Whenever one of these production records changes, copy the functionally equivalent source to this repository in the same maintenance task and commit it. Keep credentials outside GitHub; a sanitized source may obtain the same value from an environment variable or `wp-config.php` constant.

## Security

Never commit Discogs tokens, WordPress credentials, SQL/database dumps, backups, runtime caches or other secrets.

## Radio Crash

Independent internet radio project, online since 2011 with roots going back to 1986.

**Website:** `radiocrash.net`
