# Radio Crash VU: Safari investigation and validation report

This report records why the browser-side analyser was rejected in Safari, how the server-side numeric feed was validated and how the final production timing was calibrated.

## Test objective

The target was a real 18-segment stereo VU meter in Safari with all of the following constraints:

- use the existing SoundManager2 player for audible playback;
- never start a second browser audio stream;
- preserve separate left and right channels;
- do not use random, fake or pre-scripted animation;
- start only when the real player is actually playing;
- survive repeated Stop/Play cycles without skipping or digital artifacts.

## Test environment

- Safari 26.6.2 / AppleWebKit 605.1.15 on macOS
- Radio Crash production AAC stream, 44.1 kHz stereo, verified with `ffprobe`
- one existing `HTMLAudioElement`
- `AudioContext`, `MediaElementAudioSourceNode`, `ChannelSplitterNode` and two `AnalyserNode` instances
- analyser `fftSize = 256`
- CORS enabled on the stream

## Browser-side analyser matrix

| Source tested in Safari | Playback | AudioContext | Measured RMS | Lit LEDs |
| --- | --- | --- | ---: | ---: |
| Radio Crash stream directly | works; time advances | `running` | `0.000000` | 0 |
| Same stream through a same-origin proxy as `audio/aacp` | works | `running` | `0.000000` | 0 |
| Same proxy with `audio/mpeg` | works | `running` | `0.000000` | 0 |
| Locally generated continuous MP3 stream | works | `running` | `0.000000` | 0 |
| Finite local stereo WAV file | works | `running` | about `0.32` | 13 |

Additional checks:

- `crossOrigin="anonymous"` was assigned before `src`.
- The stream response included `Access-Control-Allow-Origin: *`.
- Both `getByteTimeDomainData()` and `getFloatTimeDomainData()` returned silence for the live stream.
- Placing the analyser directly in the mandatory audio signal path did not change the result.
- `HTMLMediaElement.captureStream()` was not available as a usable Safari fallback.
- The identical RMS and LED code worked with a finite WAV file.

## Browser-side conclusion

The failure was not caused by the LED renderer, RMS formula, channel splitter, CSS, startup timing or a simple missing CORS header. Safari played the continuous stream but did not expose usable PCM samples from that playback path to `MediaElementAudioSourceNode`.

This behavior matches [WebKit bug 180696](https://bugs.webkit.org/show_bug.cgi?id=180696), which covers live HLS and Icecast-style streams that play in Safari but are not routed correctly through the Web Audio graph. The issue remained open with status `NEW` when this documentation was last verified on 26 September 2026.

## Implemented architecture

A dedicated `rc-vu.service` runs on the streaming host:

1. One FFmpeg process reads the existing local stream at `http://127.0.0.1:8000/live.mp3`.
2. FFmpeg decodes it to 44.1 kHz stereo `pcm_s16le`.
3. The Python service calculates true L/R RMS and peak values.
4. Measurements receive sequence numbers and timestamps, pass through a 1.10-second base queue and are retained in a 30-second numeric history.
5. Nginx exposes compact numeric events at `https://live.radiocrash.net/vu/events`.
6. Nginx exposes the recent history at `https://live.radiocrash.net/vu/history`.
7. Safari measures its current media buffer, selects the matching timestamped sample and converts dBFS RMS with the same `10^(dBFS/20) × 24` mapping used by the local analyser.

The service does not record audio, write audio to disk or proxy audio to website visitors. Safari's browser receives only small JSON level messages.

## Calibration history

### Initial mapping

The first server implementation mapped -48 to -3 dBFS linearly onto 18 LEDs. A typical music RMS near -14 dBFS therefore appeared too high, often around 14 segments.

Version v3.1 adopted the same conversion as the existing Chrome analyser:

```text
linear RMS = 10^(dBFS / 20)
LED level  = clamp(linear RMS × 24, 0, 18)
```

That reduced the same live material from an incorrect 12–16 segments to approximately 3–10 segments and restored useful stereo movement.

### Startup gate and rendering optimization

Safari was changed to wait for the real `playing` event. During simulated slow startup, the meter remained at 0/0 with no SSE connection; the feed opened only after actual playback began.

The LED renderer was also changed to update DOM classes only when the rounded number of illuminated segments changed.

### v3.2 low-latency server tuning

On 24 September 2026 the production feed moved from 10 to 25 measurements/s and the alignment buffer moved from 5.0 to 1.5 seconds. The public endpoint measured 25.0 events/s and remained stable.

v3.2 applied level increases immediately and decay only while falling, matching the behavior of the original Chrome meter more closely.

### v3.3 live-match window and Stop/Play fix

The feed then moved to 60 measurements/s. Each event analysed the latest 256 stereo frames, matching the local analyser's `fftSize = 256`. A staging measurement produced 59.99 events/s at approximately 2.6% Python CPU and 1.2% FFmpeg CPU.

Repeated Safari Stop/Play exposed a separate player-lifecycle problem: the theme paused the infinite AAC stream but retained stale compressed data. Reusing that paused object could cause skipping, digital clicks or silence.

The Safari Stop path was therefore changed to call `unload()` on the existing SoundManager sound. The next Play opens a fresh connection on the same player object. It does not create a second `Audio` object.

### Rejected v3.4 display-sync experiment

v3.4 stored the newest real SSE level and rendered it once per Safari `requestAnimationFrame`. The lifecycle harness still passed, but movement on the production page looked slower than direct SSE rendering. The experiment was rejected and direct rendering of each incoming level event was restored.

### Alignment calibration

The 1.50-second delay remained slightly late against audible Safari playback. A controlled production comparison tested 1.25 seconds and then 1.10 seconds. The 1.10-second value was accepted as the best observed alignment.

At 60 measurements/s this queue contained 66 measurements. This is an empirical alignment value, not sample-accurate synchronization: Safari may change its own audio buffering without exposing the exact audible sample position to the SSE client.

### v3.5 time-normalized decay and 120 Hz final match

On the tested ProMotion display, Chrome/Brave rendered the local analyser at approximately 120 frames/s while Safari's numeric feed still supplied 60 measurements/s. Chrome therefore captured more short peaks and looked more responsive.

v3.5 replaced the fixed decay of `0.3` segments per rendered frame with an elapsed-time rate of 36 segments/s. Attack remained immediate.

The server was then increased from 60 to 120 measurements/s while retaining the latest-256-frame analysis and 1.10-second alignment. The queue consequently increased to 132 measurements.

Immediately after activation:

- Python used approximately 4.2% CPU and 19 MB RSS;
- FFmpeg used approximately 0.8% CPU and 48 MB RSS;
- the systemd service cgroup used approximately 21 MB;
- `lastError` remained empty;
- the final side-by-side Safari and Chrome comparison was judged visually equivalent.

### v4.0 adaptive Safari synchronization

Testing from a different network on 2 October 2026 showed that Safari's player buffer was not fixed. The live media element exposed approximately 7–9 seconds through `buffered.end(last) − currentTime`, while the numeric feed still used the former fixed 1.10-second total alignment. The levels were real, but they represented a different point in the program and therefore appeared unrelated to the audible music.

v4 retained the responsive 120 Hz server feed and added:

- a 30-second in-memory history of compact `[seq, serverTime, rmsDbL, rmsDbR]` entries;
- a public read-only `/vu/history` route;
- direct measurement of Safari's current buffered-ahead duration every 200 ms;
- a median of the latest nine readings to reject short jitter;
- `extraDelay = max(0, bufferAhead − serverBaseDelay)`;
- nearest-timestamp selection from history for every incoming SSE event;
- a two-second history retry while preserving the real live-feed fallback.

The embedded server timestamps drive sequence playback even when TCP groups multiple SSE packets. No fake animation, secondary browser audio element or additional `play()` call was introduced.

The isolated final harness completed five Stop/Play cycles with a 7.0-second mock player buffer, a calculated 5.9-second additional delay, populated history and `server-adaptive` mode in every cycle. A separate test using the real Radio Crash stream measured changing buffers around 7.6–8.0 seconds and additional delays around 6.5–6.9 seconds. After production deployment, the public endpoint contained 3,600 samples spanning 29.992 seconds and the live Safari page showed independently changing L/R values.

## Lifecycle regression test

The isolated Safari harness completed five consecutive Stop/Play cycles with:

- five SSE connections;
- real, separate L/R values;
- 50 processed level events in the original 60 Hz harness run;
- five releases of the old SoundManager stream;
- no SSE errors;
- 0/0 LEDs and a closed feed after every Stop.

The harness deliberately mocks the existing player lifecycle and consumes the real public numeric VU feed. It never starts a second browser audio stream.

## Final production baseline

```text
client:            hybrid real VU v4.0 adaptive sync
server rate:       120 measurements/s
analysis window:   latest 256 stereo frames
server base delay: 1.10 seconds / 132 measurements
numeric history:   30 seconds / 3,600 measurements
gain:              24
LEDs:              18 per channel
Safari rendering:  timestamp-selected history sample per SSE event
mobile:            disabled at 900 px and below
```

## Known limitations

- Safari's numeric VU and audible audio still use different network connections.
- Alignment depends on Safari exposing a valid buffered range; until it does, v4 temporarily uses the real live feed.
- The nine-reading median deliberately trades a short settling period for resistance to buffer jitter.
- Safari may render page updates below the display's maximum refresh rate.
- materially different latency between the audio and SSE connections can cause small temporary visual offsets.
- A browser update may change either the Web Audio limitation or Safari's buffering behavior, so major Safari releases should be retested.

These limitations do not make the meter fake: every displayed value is calculated from the real stereo program. v4 materially improves alignment but does not claim speaker-output sample accuracy.
