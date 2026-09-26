# Production source policy

The JavaScript, CSS, PHP and `server-vu/` files in this repository represent the Radio Crash production implementation. Keep formatting, line endings and legacy integration details unchanged unless a deliberate functional change is being made and tested.

Current authoritative sources:

- `now-playing-discogs-vu.js`: WordPress Now Playing, Discogs client and hybrid real VU v3.5;
- `now-playing-discogs-vu.css`: complete production frontend styling;
- `discogs-proxy.php`: sanitized Code Snippets equivalent without a committed token;
- `server-vu/`: numeric Safari VU service, systemd unit, Nginx routes and recovery scripts.

When production changes, synchronize the functionally equivalent file in this repository in the same maintenance task. Documentation may be improved independently, but must state whether a version is current, historical or rejected.

Do not reintroduce the rejected v3.4 `requestAnimationFrame` Safari renderer without new production evidence. The current v3.5 direct-SSE movement with time-normalized decay was preferred in real-world comparison.

Never commit Discogs tokens, WordPress credentials, private keys, database dumps, server backups, runtime caches or other secrets.

## Public-repository workflow

Before pushing a production update:

1. Review `git diff` for credentials, host-specific temporary data and unrelated local changes.
2. Run syntax checks for every changed language.
3. Confirm that documented production values match `/vu/status`.
4. Verify that rejected or historical experiments are clearly labelled as such.
5. If frontend behavior changed, repeat the Safari lifecycle test and one Chrome/Firefox/Brave existing-player check.
6. If server behavior changed, update the staging copies and verify the guarded rollback path.

The actual WordPress record names remain in Croatian because they are production identifiers. The end-user label `Sada slušate` also remains Croatian by design. All repository documentation, code comments, test diagnostics and operator-facing script messages should otherwise be maintained in English.

See `SECURITY.md` for private vulnerability reporting and the list of files that must never be committed.
