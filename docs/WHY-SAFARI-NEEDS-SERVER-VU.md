# Why Safari needs a server-side VU feed

Last verified: 26 September 2026

Active implementation: `hybrid real VU v3.5 time-normalized decay`

## Short answer

Chrome, Firefox and Brave allow Web Audio to analyse decoded samples from the same `HTMLAudioElement` the listener hears. Their VU meter can therefore measure audio on the player's local media clock.

In the tested Safari/WebKit path, the Radio Crash continuous Shoutcast/Icecast stream plays normally but `MediaElementAudioSourceNode` does not expose usable samples to `AnalyserNode`. Both byte and floating-point analyser reads return silence.

Safari therefore uses one shared FFmpeg analyser on the streaming server. It calculates real stereo levels from the same program source and sends only compact numeric L/R values to Safari through Server-Sent Events (SSE). The browser still has exactly one audible audio player and one audio stream.

## Normal path in Chrome, Firefox and Brave

```text
existing SoundManager2 player
        │
        └─ HTMLAudioElement heard by the listener
               │
               └─ MediaElementAudioSourceNode
                      │
                      └─ ChannelSplitterNode
                           ├─ left AnalyserNode
                           └─ right AnalyserNode
                                  │
                                  └─ RMS → gain 24 → 18 LED segments
```

`createMediaElementSource()` attaches the Web Audio graph to the existing player. The code does not create another `Audio` object, replace the stream URL or call `play()` on a second element.

The local path uses:

- `fftSize = 256`;
- separate left and right channels;
- time-domain RMS;
- gain `24`;
- immediate attack and elapsed-time-normalized decay;
- `requestAnimationFrame` for reading and rendering the local analyser.

Because the analyser and audible signal share one player and one media clock, browser buffering is already reflected in the samples being measured.

## What happens in Safari

The following was confirmed in Safari:

- the `HTMLAudioElement` plays and its current time advances;
- `AudioContext.state` is `running`;
- the Web Audio graph can be constructed;
- `getByteTimeDomainData()` and `getFloatTimeDomainData()` return silence for the continuous stream;
- the same analyser, RMS and LED code works with a finite WAV file.

The practical result is playback without usable PCM samples in JavaScript.

This matches [WebKit bug 180696](https://bugs.webkit.org/show_bug.cgi?id=180696), reported for HLS and other streaming protocols including Icecast. The issue describes streams that play while Web Audio effects or analysis do not receive the media signal. Its status remained `NEW` when checked on 26 September 2026.

The [Web Audio specification for `MediaElementAudioSourceNode`](https://webaudio.github.io/web-audio-api/#MediaElementAudioSourceNode) defines media-element audio as the node's source. It also requires silence for cross-origin media that is not CORS-enabled. The Radio Crash failure was not treated as a simple CORS mistake because correct CORS headers, a same-origin proxy and alternate MIME types were all tested without restoring analyser data.

## Evidence that the application code was not the cause

| Safari test | Playback | Analyser result |
| --- | --- | --- |
| Radio Crash stream directly | works | silence only |
| Same stream through a same-origin proxy as `audio/aacp` | works | silence only |
| Same stream through the proxy as `audio/mpeg` | works | silence only |
| Locally generated continuous MP3 stream | works | silence only |
| Finite stereo WAV file | works | real values |

The investigation also verified:

- `crossOrigin="anonymous"` was assigned before `src`;
- the stream sent a matching `Access-Control-Allow-Origin` header;
- both byte and float analyser APIs were tested;
- the analyser was placed in the required audio signal path;
- L/R splitting, RMS calculation, gain and LEDs worked with finite media;
- changing the MIME header did not fix live-stream analysis.

This ruled out the LED renderer, RMS calculation, channel selection, CSS, startup order and ordinary CORS configuration as the primary cause.

## Selected Safari architecture

```text
                           ┌─ Chrome / Firefox / Brave
Shoutcast live.mp3 ────────┤  existing browser player → local Web Audio VU
                           │
                           └─ streaming host
                                └─ one shared FFmpeg decoder
                                     └─ PCM L/R RMS + peak
                                          └─ 1.10 s level queue
                                               └─ numeric SSE events
                                                    └─ Safari LED VU

Safari audio: existing browser player → speakers
Safari VU:    numeric SSE data → LED display
```

`rc-vu.service` opens one local connection to `http://127.0.0.1:8000/live.mp3`. FFmpeg decodes 44.1 kHz stereo `pcm_s16le`; the Python service calculates:

- `rmsDbL` and `rmsDbR`;
- `peakDbL` and `peakDbR`;
- 120 measurements/s;
- the latest 256 stereo frames per measurement;
- a 1.10-second queue containing 132 measurements.

Nginx exposes only:

- `https://live.radiocrash.net/vu/events` — numeric SSE levels;
- `https://live.radiocrash.net/vu/status` — service health and configuration.

The service does not record audio, store it on disk or send audio to website visitors.

## Why this is not a second Safari audio stream

The two connections have different purposes:

- the existing SoundManager2 `HTMLAudioElement` is the only browser connection that downloads and plays audio;
- `EventSource` downloads small text messages containing L/R numbers;
- the Safari branch contains no `new Audio()`, secondary audio `src` or second `play()` call;
- all Safari visitors share one server-side FFmpeg process instead of each visitor opening a second audio download.

This avoids duplicate sound, duplicate stream bandwidth and two independent players drifting apart.

## Timing and visual response

Chrome's analyser and its audible audio share the same local media clock. Safari uses two timing paths:

1. the browser buffers and plays the audio stream;
2. the server analyses the program near its source, delays numeric levels by 1.10 seconds and sends them over SSE.

Safari, the network and SoundManager can change playback buffering dynamically. The SSE connection cannot ask Safari which exact sample is currently reaching the speakers. The 1.10-second delay is therefore an empirically calibrated alignment, not sample-accurate synchronization.

The final response matching required two additional choices:

- decay is expressed as 36 LED segments/s instead of a fixed amount per browser frame;
- the server publishes 120 measurements/s so it captures short peaks at the same cadence as the tested Chrome/Brave analyser on a ProMotion display.

The final production comparison was judged visually equivalent. Small temporary differences can still occur if Safari changes its audio buffer, reduces page rendering frequency or experiences network jitter.

## Safari player lifecycle

The SSE connection opens only after the existing player emits `playing`. This prevents the VU from moving while Safari is still filling its initial audio buffer.

On Stop, the client:

1. closes `EventSource`;
2. resets both LED channels to zero;
3. calls `unload()` on the existing SoundManager sound.

The unload is necessary because the theme otherwise pauses an infinite AAC stream and may later resume stale compressed data. Repeated reuse caused skipping, digital artifacts or silence. The next Play creates a fresh network connection on the same SoundManager player object; it does not create another player.

## Rejected alternatives

### Fake animation

A fake meter does not represent the music or stereo image. It was used only as a temporary early fallback and is not part of the production solution.

### A second audio element for analysis

A second element could create duplicate sound and stream traffic. Independent players would also drift and would not provide reliable synchronization. The project therefore enforces an “existing player only” rule.

### Same-origin proxy or MIME-only changes

Both were tested. Playback continued to work, but Safari's analyser still returned silence.

### Safari rendering through `requestAnimationFrame`

The experimental v3.4 client stored the newest SSE level and rendered it on Safari's animation frame. It passed the isolated lifecycle test but looked slower on the production page. v3.5 therefore renders every incoming SSE measurement directly while keeping decay independent of event or frame count.

## When to reconsider local Web Audio in Safari

Keep the server-side path until a new Safari/WebKit release passes all of these checks on the real Radio Crash stream:

1. byte or float analyser data contains real, non-zero samples;
2. left and right channels remain separate;
3. playback and analysis use only the existing player;
4. the Network panel shows no second audio request;
5. at least five Stop/Play cycles complete without skipping, artifacts or silence;
6. behavior is confirmed on the production page, not only with a finite audio file.

If all checks pass, Safari can return to the same local analyser path as Chrome and the estimated server alignment can be removed.

## Related documentation

- [Safari investigation and validation report](SAFARI-TEST-REPORT.md)
- [Operations guide](VU-OPERATIONS.md)
- [WordPress deployment](WORDPRESS-COPY-PASTE.md)
- [Server installation and maintenance](../server-vu/README.md)
