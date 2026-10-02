# Safari VU investigation and final decision

Last updated: 2 October 2026

## Objective

Use the existing Radio Crash player only, preserve stereo L/R behavior, avoid duplicate audio, survive repeated Stop/Start cycles and show a responsive VU in Safari.

## Browser-local analyser result

Chrome, Firefox and Brave successfully analyse the existing SoundManager2 media element. Safari played the continuous live stream but returned silence from both byte and floating-point Web Audio analyser reads. Finite media worked through the same graph, and CORS, same-origin proxy and MIME experiments did not change the continuous-stream result.

Conclusion: the production Safari/WebKit path did not expose usable PCM from the existing live player.

## Server-side experiment

Versions v3 through v4 used a shared FFmpeg decoder and numeric L/R transport. The experiment tested:

- 25, 60 and 120 updates per second;
- a 256-frame analysis window;
- fixed low-latency queues;
- elapsed-time-normalized attack/decay;
- timestamped 30-second history;
- client measurement of `buffered.end − currentTime`;
- repeated side-by-side Safari and Chromium comparisons.

The numeric measurements were real and stereo. They sometimes looked close after calibration, but the quality changed with connection, location, startup and Safari buffering. The server and player did not share a clock, and Safari's exposed buffer information could not identify the exact sample at the speakers reliably. Higher rates made level capture more responsive but did not solve timeline identity.

Conclusion: server measurements could not be claimed as a synchronized listener-side VU.

## Final production decision

The server VU was retired. Safari now uses a visual fallback that is gated by the real player's lifecycle. Chrome, Firefox and Brave retain the real local analyser.

The Safari fallback:

- starts only after `playing`;
- clears on pause, end or Stop;
- uses correlated but non-identical L/R movement;
- uses elapsed-time attack/decay;
- opens no server VU connection and no second audio stream;
- retains the Safari Stop cleanup that unloads stale paused AAC data from the existing SoundManager object.

The production server service, Nginx VU routes, port listener, application directory, staging files and VU backups were removed on 2 October 2026. Nginx and Icecast remained active; `ffmpeg` was retained as a shared package.

## Regression test

The local harness performs five Safari Stop/Start cycles and checks:

- the VU does not start before `playing`;
- fake animation frames and LEDs advance while playing;
- Stop clears the LEDs and state;
- the existing paused stream is released exactly once per cycle;
- no SSE/server VU connection or history request occurs.

Run `python3 tests/harness_server.py` and open `http://127.0.0.1:8766/tests/hybrid-vu-harness.html?autorun=1` in Safari.

## Interpretation

The Safari display is a visual fallback and must not be described as a measurement or as synchronized to audio. This is a deliberate accuracy decision: plausible visual motion is less misleading than real but temporally unrelated samples presented as the listener's current signal. If that trade-off is unacceptable later, hide the Safari VU until WebKit can analyse the production stream locally.
