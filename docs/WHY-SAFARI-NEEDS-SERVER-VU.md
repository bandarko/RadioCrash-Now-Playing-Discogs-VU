# Why Safari uses a visual VU fallback

Last updated: 2 October 2026.
Current implementation: `local real VU + Safari visual fallback v5.0`

## Short answer

Chrome, Firefox and Brave can expose decoded samples from the existing Radio Crash player to Web Audio. Their VU meter therefore measures the exact audio element the listener hears.

In the tested Safari/WebKit configuration, the continuous cross-origin Icecast/Shoutcast stream plays normally but Web Audio returns silence. Safari cannot produce a real browser-local VU from that player. A server analyser can measure the real broadcast, but it cannot know Safari's changing playback-buffer position accurately enough to guarantee that the displayed sample is the sample currently heard. The stable production choice is a visual fallback in Safari.

## Real local path in Chrome, Firefox and Brave

```text
existing SoundManager2 HTMLAudioElement
        └─ MediaElementAudioSourceNode
              └─ ChannelSplitterNode
                    ├─ left AnalyserNode
                    └─ right AnalyserNode
                          └─ RMS → gain → 18 LED segments
```

The analyser and speakers share one media element and one playback clock. No second player or audio request is required.

## What was verified in Safari

- The media element played and its current time advanced.
- `AudioContext` entered the running state and the graph could be created.
- Byte and floating-point analyser reads returned silence for the continuous stream.
- The same analyser, channel split, RMS calculation and LEDs worked with finite media.
- Correct CORS setup, a same-origin proxy and alternate MIME headers did not restore live-stream samples.

This is consistent with long-standing WebKit limitations around routing some streaming media through `MediaElementAudioSourceNode`. The practical distinction is important: successful playback does not guarantee that JavaScript receives PCM samples.

## Why the server-side real-level attempt was retired

The experiment ran one shared FFmpeg decoder on the streaming host and sent numeric timestamped L/R levels to Safari. It did not create a second browser audio stream, and the measurements themselves were real.

However, there were two independent timelines:

```text
server analyser clock ── numeric level timestamp
Safari player clock   ── network + decoder + changing media buffer ── speakers
```

Safari's live buffer varied by connection, location, startup and repeated playback. The browser's reported buffered range was not a sufficiently stable mapping to the exact audible sample. Fixed delays, higher update rates, short analysis windows and a 30-second history improved the appearance in individual tests but could not guarantee synchronization. A fast, accurate measurement of the wrong point in time is still a misleading VU display.

The server path also added an FFmpeg process, a Python service, memory history, SSE clients, Nginx routes and operational complexity for a result that was not reliably tied to the listener's audio. It was removed from production on 2 October 2026.

## Current Safari behavior

Safari uses a lightweight correlated stereo animation:

- it starts only after the existing media element emits `playing`;
- it stops and clears immediately when playback stops or ends;
- it has shared L/R movement with small channel differences and occasional peaks;
- attack and decay use elapsed time, so display refresh rate does not determine the speed;
- it creates no `Audio` object, makes no `/vu/` request and starts no second stream.

This fallback is deliberately described as visual, not as a real measurement. It is preferable to presenting unsynchronized real server measurements as though they were the listener's current audio.

## When Safari can return to a real VU

Retest after a meaningful WebKit update. Safari may use the normal local path only when the production live stream produces non-zero, independently changing L/R analyser data from the same existing audio element, through repeated Stop/Start cycles, without a proxy or second stream. At that point the Safari browser detection can be removed and the common local analyser used everywhere.
