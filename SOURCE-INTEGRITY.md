# Production source policy

The JavaScript, CSS, PHP and `server-vu/` files in this repository represent the Radio Crash production implementation. Keep formatting, line endings and legacy integration details unchanged unless a deliberate functional change is being made and tested.

Current authoritative sources:

- `now-playing-discogs-vu.js`: WordPress Now Playing, Discogs client and hybrid real VU v3.3;
- `now-playing-discogs-vu.css`: complete production frontend styling;
- `discogs-proxy.php`: sanitized Code Snippets equivalent without a committed token;
- `server-vu/`: numeric Safari VU service, systemd unit, Nginx routes and recovery scripts.

When production changes, synchronize the functionally equivalent file in this repository in the same maintenance task. Documentation may be improved independently, but must state whether a version is current, historical or rejected.

Do not reintroduce the rejected v3.4 `requestAnimationFrame` Safari renderer without new production evidence. The current v3.3 direct-SSE movement was preferred in real-world comparison.

Never commit Discogs tokens, WordPress credentials, private keys, database dumps, server backups, runtime caches or other secrets.
