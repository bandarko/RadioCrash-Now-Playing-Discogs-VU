# Security policy

## Reporting a vulnerability

Do not publish credentials, private keys, server backups, exploitable configuration details or a working attack in a public issue.

Use GitHub's private vulnerability reporting or contact the repository owner privately through GitHub. Include:

- the affected file, endpoint or component;
- the observed behavior and expected behavior;
- minimal reproduction steps;
- impact and prerequisites;
- any safe mitigation already tested.

## Public repository boundaries

This repository intentionally contains:

- public Radio Crash website and VU endpoint URLs;
- a sanitized WordPress Discogs proxy;
- the VU service source and hardened systemd/Nginx examples;
- deployment paths and operational scripts for the documented host layout.

It must never contain:

- `RC_DISCOGS_TOKEN` values or other API credentials;
- WordPress, SSH or sudo passwords;
- SSH private keys or host credential files;
- database exports, server backups or WordPress configuration files;
- production logs containing sensitive request data;
- unredacted environment files.

## Credential design

The browser calls `/wp-json/rc/v1/discogs`. The WordPress proxy reads `RC_DISCOGS_TOKEN` from the server environment and adds it to the server-to-server Discogs request. Do not move the token into JavaScript, HTML, query strings or committed PHP source.

## Deployment safety

- Review diffs before copying complete frontend files into WordPress.
- Treat `server-vu/` as archived source, not a production deployment target.
- The retired `rc-vu.service` must remain absent from production unless the architecture is deliberately re-approved.
- Preserve the browser's “existing player only” rule.

## Supported production baseline

Security and operational documentation follows the current production baseline on the `main` branch:

```text
client:            local real VU + Safari visual fallback v5.0
Safari server VU:  retired; no public /vu/ routes
browser audio:     existing player only
```

Historical or experimental branches may not receive fixes.
