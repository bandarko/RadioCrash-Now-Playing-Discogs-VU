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
- Run server scripts from the documented staging directory.
- Use the guarded scripts rather than editing the active systemd unit or Nginx configuration in place.
- Validate Nginx with `nginx -t` before reload.
- Restart only `rc-vu.service` for VU-only changes.
- Keep the SSE endpoint numeric-only; never use it to proxy audio.
- Preserve the browser's “existing player only” rule.

## Supported production baseline

Security and operational documentation follows the current production baseline on the `main` branch:

```text
client:            hybrid real VU v3.5 time-normalized decay
server rate:       120 measurements/s
analysis window:   latest 256 stereo frames
alignment buffer:  1.10 seconds
```

Historical or experimental branches may not receive fixes.
