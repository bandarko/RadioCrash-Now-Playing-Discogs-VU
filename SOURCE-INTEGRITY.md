# Production source policy

The JavaScript, CSS and PHP files in this repository represent the Radio Crash production implementation. The `server-vu/` directory is an explicitly archived experiment. Keep formatting, line endings and legacy integration details unchanged unless a deliberate functional change is being made and tested.

Current authoritative sources:

- `now-playing-discogs-vu.js`: WordPress Now Playing, Discogs client, local real VU and Safari visual fallback v5.0;
- `now-playing-discogs-vu.css`: complete production frontend styling;
- `discogs-proxy.php`: sanitized Code Snippets equivalent without a committed token;
- `server-vu/`: retired numeric Safari VU experiment and final uninstall script; not deployed.

When production changes, synchronize the functionally equivalent file in this repository in the same maintenance task. Documentation may be improved independently, but must state whether a version is current, historical or rejected.

Do not reintroduce the server-side Safari renderer without a new design that demonstrably shares the audible player's timeline. The retired v3/v4 series produced real levels but could not guarantee synchronization.

Never commit Discogs tokens, WordPress credentials, private keys, database dumps, server backups, runtime caches or other secrets.

## Public-repository workflow

Before pushing a production update:

1. Review `git diff` for credentials, host-specific temporary data and unrelated local changes.
2. Run syntax checks for every changed language.
3. Confirm that Safari makes no `/vu/` requests and the retired server routes remain absent.
4. Verify that rejected or historical experiments are clearly labelled as such.
5. If frontend behavior changed, repeat the Safari lifecycle test and one Chrome/Firefox/Brave existing-player check.
6. If archived server material changed, keep it clearly labelled as non-production.

The actual WordPress record names remain in Croatian because they are production identifiers. The end-user label `Sada slušate` also remains Croatian by design. All repository documentation, code comments, test diagnostics and operator-facing script messages should otherwise be maintained in English.

See `SECURITY.md` for private vulnerability reporting and the list of files that must never be committed.
