/**
 * RADIO CRASH — NOW PLAYING + DISCOGS + VU
 * WordPress: Custom CSS & JS → "JS 1 za Svira sada + Discogs + VU"
 * Copy/paste the complete file into the existing JavaScript record.
 *
 * Version: 2026-09-26 — hybrid real VU v3.5 time-normalized decay
 * - Now Playing and Discogs use the existing WordPress proxy.
 * - The VU has 18 LED segments per channel.
 * - Chrome/Firefox/Brave analyse only the existing SoundManager2 player.
 * - Safari receives numeric L/R levels from the server over SSE.
 * - No second Audio(), stream URL or play()/pause() call is created.
 * - The VU is not initialized at viewport widths of 900 px and below.
 * - There is no fake/random fallback: LEDs remain at zero without a real signal.
 */

(function () {
  // ===== RC Now Playing (proxy-only) =====
  // Version: 2026-02-15 rc-np-proxy-v1
  // Discogs is called only through the WordPress proxy (/wp-json/rc/v1/discogs).
  // The browser must never call api.discogs.com directly.

  const STATS_URL = "https://live.radiocrash.net/stats?json=1&sid=1";
  const TEXT_URL  = "https://live.radiocrash.net/currentsong?sid=1";
  const POLL_MS   = 12000;

  const DISCOGS_PROXY_URL = "/wp-json/rc/v1/discogs"; // ?artist=..&title=..&type=release

  // Debug switch; keep false in production.
  const DEBUG = false;

  // ===== STATE =====
  let inflight = false;
  let lastDisplay = "";
  let lastLink = "";
  let lastCover = "";

  // Remove an old instance if one exists.
  if (window.RCNP_TIMER) { try { clearInterval(window.RCNP_TIMER); } catch (_) {} }
  if (window.RCNP_TIMER2) { try { clearTimeout(window.RCNP_TIMER2); } catch (_) {} }

  function log(...a){ if (DEBUG) console.log("[RCNP]", ...a); }
  function warn(...a){ if (DEBUG) console.warn("[RCNP]", ...a); }

  function onReady(fn) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn, { once: true });
    } else { fn(); }
  }

  function youtubeSearchURL(artist, title) {
    const q = encodeURIComponent(`${artist || ""} ${title || ""}`.trim());
    return `https://www.youtube.com/results?search_query=${q}`;
  }

  function absolutizeDiscogsUrl(u) {
    if (!u) return "";
    try {
      const apiMatch = String(u).match(/^https?:\/\/api\.discogs\.com\/(releases|masters|artists|labels)\/(\d+)/i);
      if (apiMatch) {
        const kind = apiMatch[1].toLowerCase();
        const id = apiMatch[2];
        const map = { releases: "release", masters: "master", artists: "artist", labels: "label" };
        return `https://www.discogs.com/${map[kind]}/${id}`;
      }
      return new URL(String(u), "https://www.discogs.com").href;
    } catch (_) { return ""; }
  }

  async function fetchWithTimeout(url, ms, opts) {
    const ctl = ("AbortController" in window) ? new AbortController() : null;
    const t = setTimeout(() => { try { ctl && ctl.abort(); } catch (_) {} }, ms);
    try {
      const r = await fetch(url, Object.assign(
        { cache: "no-store", credentials: "same-origin" },
        opts || {},
        { signal: ctl ? ctl.signal : undefined }
      ));
      return r;
    } finally { clearTimeout(t); }
  }

  async function getNowPlaying() {
    // 1) stats json
    try {
      const r = await fetchWithTimeout(STATS_URL + "&_=" + Date.now(), 3000, { headers: { Accept: "application/json" } });
      const txt = await r.text();
      try {
        const j = JSON.parse(txt);
        if (j && (j.currentsong || j.songtitle)) return j.currentsong || j.songtitle;
      } catch (_) {}
    } catch (_) {}

    // 2) currentsong plain
    try {
      const r2 = await fetchWithTimeout(TEXT_URL + "&_=" + Date.now(), 3000, { headers: { Accept: "text/plain" } });
      const t2 = (await r2.text()).replace(/\s+/g, " ").trim();
      if (t2) return t2;
    } catch (_) {}

    return "";
  }

  function parseArtistTitle(raw) {
    const cleaned = String(raw || "")
      .replace(/_/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    const parts = cleaned.split(/\s*[-–—]\s*/);
    if (parts.length >= 2) {
      const artist = parts.shift().trim();
      let title = parts.join(" - ").trim();

      // makni zadnje zagrade na kraju
      title = title.replace(/[\(\[\{]\s*.*?[\)\]\}]\s*$/g, "").trim();

      title = title
        .replace(/\?eta/ig, "beta")
        .replace(/β/ig, "beta")
        .replace(/''/g, '"')
        .replace(/[“”]/g, '"')
        .replace(/[‘’]/g, "'");

      const display = `${artist} - ${title}`.trim();
      return { artist, title, display };
    }
    return { artist: "", title: "", display: cleaned };
  }

  function normalizeArtist(artist) {
    if (!artist) return "";
    return artist.split(/[\/,;&]/)[0].trim();
  }

  function normalizeTitle(title) {
    return String(title || "")
      .replace(/_/g, " ")
      .replace(/\?eta/ig, "beta")
      .replace(/β/ig, "beta")
      .replace(/''/g, '"')
      .replace(/[“”]/g, '"')
      .replace(/[‘’]/g, "'")
      .replace(/\s*medley:\s*/i, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function titleVariants(title) {
    const base = normalizeTitle(title);
    const withParenPart = base.replace(/\bpart\s*(\d+)\b/i, "(Part $1)");
    const withoutPart   = base.replace(/\bpart\s*\d+\b/i, "").replace(/\s+/g, " ").trim();
    const colonized     = base.replace(/\bp\s*[\s\-]\s*machinery\b/i, "P:Machinery");
    const dashed        = base.replace(/:/g, "-");
    const spaced        = base.replace(/:/g, " ");
    const noTrailingParens = base.replace(/\s*\(.*?\)\s*$/, "").trim();

    return Array.from(new Set(
      [base, withParenPart, withoutPart, colonized, dashed, spaced, noTrailingParens]
        .map(s => s.replace(/\s+/g, " ").trim())
        .filter(Boolean)
    ));
  }

  function pickBestResult(raw, artist, title) {
    if (!raw || !Array.isArray(raw.results)) return null;

    const norm = s => String(s || "")
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "");

    const A = norm(artist);
    const T = norm(title);
    const tokens = T.split(/\s+/).filter(w => w && !/^(the|and|of|to|a|an|in|on|for|mix|version|edit)$/i.test(w));

    // 1) Artist plus all title tokens.
    let hit = raw.results.find(it => {
      const tt = norm(it.title);
      return tt.includes(A) && tokens.every(tok => tt.includes(tok));
    });
    if (hit) return hit;

    // 2) Artist plus at least half of the title tokens.
    hit = raw.results.find(it => {
      const tt = norm(it.title);
      const matchCount = tokens.filter(tok => tt.includes(tok)).length;
      return tt.includes(A) && matchCount >= Math.max(1, Math.ceil(tokens.length / 2));
    });
    if (hit) return hit;

    // 3) Fallback: highest community.have count (most common release).
    let best = null, bestHave = -1;
    for (const it of raw.results) {
      const have = (it.community && typeof it.community.have === "number") ? it.community.have : 0;
      if (have > bestHave) { bestHave = have; best = it; }
    }
    return best;
  }

  async function discogsViaProxy(artist, title) {
    if (!artist || !title) return { link: "", cover: "" };

    const a = normalizeArtist(artist);
    const variants = titleVariants(title);

    for (const v of variants) {
      const url = `${DISCOGS_PROXY_URL}?artist=${encodeURIComponent(a)}&title=${encodeURIComponent(v)}&type=release&_=${Date.now()}`;
      log("Discogs proxy call:", url);

      try {
        const r = await fetchWithTimeout(url, 4500, { headers: { Accept: "application/json" } });
        if (!r || !r.ok) continue;

        const wrap = await r.json();
        if (!wrap || !wrap.ok || !wrap.raw) continue;

        const best = pickBestResult(wrap.raw, a, v);
        if (best) {
          const link = absolutizeDiscogsUrl(best.uri || best.resource_url || "");
          const cover = best.cover_image || "";
          return { link, cover };
        }
      } catch (e) {
        warn("Proxy request failed:", e);
      }
    }

    return { link: "", cover: "" };
  }

  // ---------- UI ----------
  function ensureTopBadge() {
    let el = document.getElementById("rcnp-top-badge");
    if (!el) {
      el = document.createElement("span");
      el.id = "rcnp-top-badge";
      (document.body || document.documentElement).appendChild(el);
    }
    return el;
  }

  function ensureFooter() {
    const container =
      document.querySelector("#qwPlayer") ||
      document.querySelector(".qw-player") ||
      document.querySelector("#colophon .site-info") ||
      document.querySelector("#colophon") ||
      document.querySelector(".site-footer") ||
      document.querySelector("footer") ||
      document.body;

    let el = document.getElementById("qwPlayerAuthor");
    if (!el) {
      el = document.createElement("div");
      el.id = "qwPlayerAuthor";
      el.style.display = "block";
      el.style.marginTop = "4px";
      el.style.position = "relative";
      el.style.zIndex = 50;

      const label = document.createElement("span");
      label.className = "np-label";
      label.textContent = "Sada slušate: ";

      const text = document.createElement("span");
      text.className = "np-text";
      text.textContent = "…";

      el.replaceChildren(label, text);
      container.appendChild(el);
    }
    return el;
  }

  function setTop(display, link, cover) {
    const top = ensureTopBadge();
    while (top.firstChild) top.removeChild(top.firstChild);

    if (cover) {
      const img = document.createElement("img");
      img.className = "rcnp-cover";
      img.alt = "";
      img.src = cover;
      top.appendChild(img);
    }

    top.appendChild(document.createTextNode("Sada slušate: "));

    if (link) {
      const a = document.createElement("a");
      a.id = "rcnp-top-link";
      a.href = link;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.appendChild(document.createTextNode(display || ""));
      top.appendChild(a);
    } else {
      const span = document.createElement("span");
      span.id = "rcnp-top-text";
      span.appendChild(document.createTextNode(display || ""));
      top.appendChild(span);
    }

    top.title = `Sada slušate: ${display || ""}`;
  }

  function setFooter(display, link) {
    const el = ensureFooter();

    let label = el.querySelector(".np-label");
    if (!label) {
      label = document.createElement("span");
      label.className = "np-label";
      el.prepend(label);
    }
    label.textContent = "Sada slušate: ";

    let a = el.querySelector("#rcnp-footer-link");
    let span = el.querySelector(".np-text");

    if (link) {
      if (!a) {
        if (span) { span.remove(); span = null; }
        a = document.createElement("a");
        a.id = "rcnp-footer-link";
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        el.appendChild(a);
      }
      a.href = link;
      a.textContent = display || "";
    } else {
      if (!span) {
        if (a) { a.remove(); a = null; }
        span = document.createElement("span");
        span.className = "np-text";
        el.appendChild(span);
      }
      span.textContent = display || "";
    }

    el.title = `Sada slušate: ${display || ""}`;
  }

  // ---------- loop ----------
  async function tick() {
    if (inflight) return;
   // if (document.visibilityState === "hidden") return;
    inflight = true;

    try {
      const np = await getNowPlaying();
      if (!np) return;

      const { artist, title, display } = parseArtistTitle(np);
      if (!display) return;

      const changed = (display !== lastDisplay);
      const hasBoth = !!artist && !!title;

      if (changed) {
        log("Now playing changed:", display);
        lastDisplay = display;
        lastLink = "";
        lastCover = "";
        setTop(display, "", "");
        setFooter(display, "");
      } else {
        setFooter(display, lastLink);
      }

      if (changed) {
        const idle = window.requestIdleCallback || function (cb) { return setTimeout(cb, 0); };
        idle(async () => {
          let link = "", cover = "";

          if (hasBoth) {
            ({ link, cover } = await discogsViaProxy(artist, title));
          }

          if (!link) {
            link = youtubeSearchURL(artist, title || "");
            cover = "";
          }

          if (display !== lastDisplay) return;

          lastLink = link;
          lastCover = cover;

          setTop(lastDisplay, lastLink, lastCover);
          setFooter(lastDisplay, lastLink);
        }, { timeout: 1200 });
      }
    } finally {
      inflight = false;
    }
  }

  onReady(() => {
    log("Loaded rc-np-proxy-v1 ✅ (no direct Discogs calls)");
    ensureTopBadge();
    ensureFooter();
    setFooter("…", "");
    tick();

    const timer = setInterval(() => {
      const jitter = Math.floor(Math.random() * 800) - 400;
      window.RCNP_TIMER2 = setTimeout(tick, Math.max(0, 300 + jitter));
    }, POLL_MS);

    window.RCNP_TIMER = timer;
  });

})();


/* === RC VU METER STEREO - HYBRID REAL VU v4.0 ADAPTIVE SYNC - 2.10.2026. ===
 * Chrome/Firefox/Brave: Web Audio analyses the existing player.
 * Safari: the server sends real L/R levels and a short measurement history.
 * The Safari path measures its own playback buffer and selects the server
 * measurement that belongs to the audio frame currently being heard.
 * Neither path creates another Audio object or starts a second audio stream.
 */
(function () {
  const RUNTIME_KEY = "RC_VU_HYBRID_RUNTIME";
  const LEGACY_RUNTIME_KEY = "RC_VU_EXISTING_PLAYER_RUNTIME";
  const GRAPH_KEY = "__rcVuExistingPlayerGraph";
  const SERVER_EVENTS_URL = "https://live.radiocrash.net/vu/events";
  const SERVER_HISTORY_URL = "https://live.radiocrash.net/vu/history";
  const DEBUG = false;

  const userAgent = navigator.userAgent || "";
  const vendor = navigator.vendor || "";
  const IS_SAFARI =
    /Safari/i.test(userAgent) &&
    /Apple Computer/i.test(vendor) &&
    !/(Chrome|Chromium|CriOS|Edg|OPR|Firefox|FxiOS)/i.test(userAgent);

  // Remove an old instance if the Custom JS record executes again.
  [RUNTIME_KEY, LEGACY_RUNTIME_KEY].forEach(function (key) {
    if (window[key] && typeof window[key].destroy === "function") {
      try { window[key].destroy(); } catch (_) {}
    }
  });

  // Do not initialize VU logic or the server connection on narrow/mobile views.
  if (window.matchMedia("(max-width: 900px)").matches) {
    const oldVu = document.getElementById("rc-vu-mini");
    if (oldVu) oldVu.remove();
    return;
  }

  let active = false;
  let raf = null;
  let syncTimer = null;
  let hookTimer = null;
  let safariReleaseToken = 0;
  let safariStreamReleases = 0;

  let mainAudio = null;
  let observedAudio = null;
  let audioCtx = null;
  let analyserL = null;
  let analyserR = null;
  let dataArrayL = null;
  let dataArrayR = null;
  let graphFailedFor = null;

  let eventSource = null;
  let historyController = null;
  let historyRetryTimer = null;
  let historyReady = false;
  let safariPlaybackReady = false;
  let lastServerEventAt = 0;
  let latestServerTime = 0;
  let serverClockOffsetMs = 0;
  let hasServerClockOffset = false;
  let serverBufferSeconds = 1.1;
  let serverSamples = [];
  let bufferAheadReadings = [];
  let bufferAheadSeconds = null;
  let extraDelaySeconds = 0;
  let lastBufferMeasureAt = 0;
  let selectedServerSeq = 0;
  let historyLoads = 0;
  let adaptiveRenders = 0;
  let targetL = 0;
  let targetR = 0;
  let lastL = 0;
  let lastR = 0;
  let lastLocalRenderAt = 0;
  let lastServerRenderAt = 0;
  let serverLevelEvents = 0;
  const ledCache = { l: null, r: null };
  const renderedCount = { l: -1, r: -1 };

  // The original 0.3 per frame at 120 Hz equals 36 LED segments/s.
  // Elapsed time, not browser/SSE frame count, determines decay speed.
  const DECAY_PER_SECOND = 36;
  const MAX_DECAY_STEP_SECONDS = 0.1;
  const LOCAL_GAIN = 24;

  function log(...args) {
    if (DEBUG) console.log("[RC VU]", ...args);
  }

  function warn(...args) {
    console.warn("[RC VU]", ...args);
  }

  function createVu() {
    if (document.getElementById("rc-vu-mini")) {
      cacheVuLeds();
      return;
    }

    const vu = document.createElement("div");
    vu.id = "rc-vu-mini";
    vu.dataset.mode = IS_SAFARI ? "server-waiting" : "local-waiting";
    vu.innerHTML = `
      <div class="rc-vu-line">
        <span class="rc-vu-lbl">L</span>
        <div class="rc-vu-leds" data-ch="l"></div>
      </div>
      <div class="rc-vu-line">
        <span class="rc-vu-lbl">R</span>
        <div class="rc-vu-leds" data-ch="r"></div>
      </div>
    `;

    document.body.appendChild(vu);

    vu.querySelectorAll(".rc-vu-leds").forEach(function (bar) {
      for (let i = 0; i < 18; i++) {
        const led = document.createElement("span");
        led.className = "rc-vu-led";
        if (i >= 11 && i < 14) led.classList.add("yellow");
        if (i >= 14) led.classList.add("red");
        bar.appendChild(led);
      }
    });

    cacheVuLeds();
  }

  function cacheVuLeds() {
    ["l", "r"].forEach(function (channel) {
      const bar = document.querySelector('.rc-vu-leds[data-ch="' + channel + '"]');
      ledCache[channel] = bar ? Array.from(bar.querySelectorAll(".rc-vu-led")) : [];
      renderedCount[channel] = -1;
    });
  }

  function setMode(mode) {
    const vu = document.getElementById("rc-vu-mini");
    if (vu && vu.dataset.mode !== mode) vu.dataset.mode = mode;
  }

  function setLevel(channel, level) {
    const leds = ledCache[channel] || [];
    if (!leds.length) return;
    const count = Math.max(0, Math.min(leds.length, Math.round(level)));
    const previous = renderedCount[channel];

    if (count === previous) return;

    if (previous < 0) {
      leds.forEach(function (led, index) {
        led.classList.toggle("on", index < count);
      });
    } else if (count > previous) {
      for (let index = previous; index < count; index++) leds[index].classList.add("on");
    } else {
      for (let index = count; index < previous; index++) leds[index].classList.remove("on");
    }

    renderedCount[channel] = count;
  }

  function zeroLevels() {
    targetL = 0;
    targetR = 0;
    lastL = 0;
    lastR = 0;
    lastLocalRenderAt = 0;
    lastServerRenderAt = 0;
    setLevel("l", 0);
    setLevel("r", 0);
  }

  function getMainSound() {
    try {
      if (
        window.soundManager &&
        window.soundManager.sounds &&
        window.soundManager.sounds.currentSound
      ) {
        return window.soundManager.sounds.currentSound;
      }

      const jq = window.jQuery || window.$;
      if (jq && jq.mySound) return jq.mySound;
    } catch (_) {}

    return null;
  }

  function getMainAudio() {
    const sound = getMainSound();
    return sound && sound._a ? sound._a : null;
  }

  function isMainPlayerPlaying() {
    const sound = getMainSound();
    const audio = sound && sound._a;

    // The Safari server feed may start only on the real HTMLMediaElement
    // "playing" event, not when SoundManager merely receives a Play command.
    if (IS_SAFARI) {
      return !!audio && safariPlaybackReady && !audio.paused && !audio.ended;
    }

    if (audio && !audio.paused && !audio.ended) return true;
    return !!sound && sound.playState === 1 && sound.paused !== true;
  }

  function prepareMainAudioForCors(sound) {
    try {
      const audio = sound && sound._a;
      if (!audio) return;

      // Needed only for the local Web Audio analyser, before assigning the stream URL.
      if (!audio.currentSrc && !audio.getAttribute("src")) {
        audio.crossOrigin = "anonymous";
        if (typeof audio.setAttribute === "function") {
          audio.setAttribute("crossorigin", "anonymous");
        }
      }
    } catch (_) {}
  }

  function installSoundManagerCorsHook() {
    if (IS_SAFARI) return true;

    const sm = window.soundManager;
    if (!sm || typeof sm.createSound !== "function") return false;

    if (!sm.__rcVuHybridCorsHook) {
      const originalCreateSound = sm.createSound;

      sm.createSound = function () {
        const sound = originalCreateSound.apply(this, arguments);

        try {
          const options = arguments[0];
          const requestedId =
            typeof options === "string" ? options : options && options.id;

          if (requestedId === "currentSound" || (sound && sound.id === "currentSound")) {
            prepareMainAudioForCors(sound);
            const audio = sound && sound._a;
            observeMainAudio(audio);
            if (audioCtx) attachLocalAudio(audio);
          }
        } catch (_) {}

        return sound;
      };

      sm.__rcVuHybridCorsHook = true;
      log("SoundManager CORS hook installed");
    }

    prepareMainAudioForCors(getMainSound());
    return true;
  }

  function ensureAudioContext() {
    if (audioCtx) return audioCtx;

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;

    try {
      audioCtx = new AudioContextClass();
      return audioCtx;
    } catch (error) {
      warn("AudioContext is unavailable.", error);
      return null;
    }
  }

  function resumeAudioContext() {
    if (IS_SAFARI) return;

    const ctx = ensureAudioContext();
    if (!ctx || ctx.state === "running") return;

    try {
      const result = ctx.resume();
      if (result && typeof result.catch === "function") result.catch(function () {});
    } catch (_) {}
  }

  function useGraph(graph, audio) {
    mainAudio = audio;
    audioCtx = graph.audioCtx;
    analyserL = graph.analyserL;
    analyserR = graph.analyserR;
    dataArrayL = graph.dataArrayL;
    dataArrayR = graph.dataArrayR;
    graphFailedFor = null;
    setMode("local-real");
  }

  function attachLocalAudio(audio) {
    if (IS_SAFARI || !audio || graphFailedFor === audio) return false;

    observeMainAudio(audio);

    if (audio[GRAPH_KEY]) {
      useGraph(audio[GRAPH_KEY], audio);
      return true;
    }

    const ctx = ensureAudioContext();
    if (!ctx) return false;

    try {
      // Use only the existing player's audio element; no new Audio/src/play.
      const source = ctx.createMediaElementSource(audio);
      source.connect(ctx.destination);

      const splitter = ctx.createChannelSplitter(2);
      const left = ctx.createAnalyser();
      const right = ctx.createAnalyser();

      left.fftSize = 256;
      right.fftSize = 256;
      left.smoothingTimeConstant = 0.18;
      right.smoothingTimeConstant = 0.18;

      source.connect(splitter);
      splitter.connect(left, 0);
      splitter.connect(right, 1);

      const graph = {
        audioCtx: ctx,
        source,
        splitter,
        analyserL: left,
        analyserR: right,
        dataArrayL: new Uint8Array(left.fftSize),
        dataArrayR: new Uint8Array(right.fftSize)
      };

      Object.defineProperty(audio, GRAPH_KEY, {
        configurable: false,
        enumerable: false,
        writable: false,
        value: graph
      });

      useGraph(graph, audio);
      return true;
    } catch (error) {
      graphFailedFor = audio;
      setMode("local-error");
      warn("The local analyser could not attach; no second stream was started.", error);
      return false;
    }
  }

  function attachToExistingPlayer() {
    return attachLocalAudio(getMainAudio());
  }

  function dbToLedLevel(value) {
    const db = Number(value);
    if (!Number.isFinite(db) || db <= -96) return 0;

    // Same calculation as the Chrome/Firefox/Brave path:
    // dBFS -> linear RMS -> the existing gain of 24.
    const linearRms = Math.pow(10, db / 20);
    return Math.max(0, Math.min(18, linearRms * LOCAL_GAIN));
  }

  function renderSafariServerLevel() {
    // Safari can throttle or pause requestAnimationFrame while EventSource still
    // receives data normally. Rendering on each SSE event keeps the Chrome-like
    // cadence: one new stereo measurement approximately every 8 ms.
    const now = performance.now();
    const elapsedSeconds = lastServerRenderAt
      ? Math.min(MAX_DECAY_STEP_SECONDS, Math.max(0, (now - lastServerRenderAt) / 1000))
      : 1 / 60;
    lastServerRenderAt = now;
    lastL = approachLevel(lastL, targetL, elapsedSeconds);
    lastR = approachLevel(lastR, targetR, elapsedSeconds);
    setLevel("l", lastL);
    setLevel("r", lastR);
  }

  function normalizeServerSample(value) {
    const sample = Array.isArray(value)
      ? value
      : [value && value.seq, value && value.serverTime, value && value.rmsDbL, value && value.rmsDbR];
    const seq = Number(sample[0]);
    const serverTime = Number(sample[1]);
    const rmsDbL = Number(sample[2]);
    const rmsDbR = Number(sample[3]);

    if (![seq, serverTime, rmsDbL, rmsDbR].every(Number.isFinite)) return null;
    return [seq, serverTime, rmsDbL, rmsDbR];
  }

  function trimServerSamples() {
    if (serverSamples.length < 2) return;
    const cutoff = serverSamples[serverSamples.length - 1][1] - 40000;
    let first = 0;
    while (first < serverSamples.length - 1 && serverSamples[first][1] < cutoff) first += 1;
    if (first) serverSamples.splice(0, first);
  }

  function addLiveServerSample(value) {
    const sample = normalizeServerSample(value);
    if (!sample) return null;
    const last = serverSamples[serverSamples.length - 1];

    if (!last || sample[0] > last[0]) {
      serverSamples.push(sample);
    } else if (sample[0] === last[0]) {
      serverSamples[serverSamples.length - 1] = sample;
    } else if (!serverSamples.some(function (item) { return item[0] === sample[0]; })) {
      serverSamples.push(sample);
      serverSamples.sort(function (a, b) { return a[0] - b[0]; });
    }

    trimServerSamples();
    return sample;
  }

  function mergeServerHistory(items) {
    const bySequence = new Map();
    serverSamples.forEach(function (sample) { bySequence.set(sample[0], sample); });
    (Array.isArray(items) ? items : []).forEach(function (value) {
      const sample = normalizeServerSample(value);
      if (sample) bySequence.set(sample[0], sample);
    });
    serverSamples = Array.from(bySequence.values()).sort(function (a, b) { return a[0] - b[0]; });
    trimServerSamples();
  }

  function measureSafariBuffer(force) {
    const now = performance.now();
    if (!force && now - lastBufferMeasureAt < 200) return bufferAheadSeconds;
    lastBufferMeasureAt = now;

    const audio = getMainAudio();
    const ranges = audio && audio.buffered;
    const currentTime = Number(audio && audio.currentTime);
    if (!ranges || !Number.isFinite(currentTime) || !ranges.length) return bufferAheadSeconds;

    let rangeEnd = null;
    try {
      for (let index = 0; index < ranges.length; index++) {
        const start = Number(ranges.start(index));
        const end = Number(ranges.end(index));
        if (currentTime >= start - 0.25 && currentTime <= end + 0.25) {
          rangeEnd = end;
          break;
        }
      }
    } catch (_) {
      return bufferAheadSeconds;
    }

    const reading = Number(rangeEnd) - currentTime;
    if (!Number.isFinite(reading) || reading < 0 || reading > 120) return bufferAheadSeconds;

    bufferAheadReadings.push(reading);
    if (bufferAheadReadings.length > 9) bufferAheadReadings.shift();
    const ordered = bufferAheadReadings.slice().sort(function (a, b) { return a - b; });
    bufferAheadSeconds = ordered[Math.floor(ordered.length / 2)];
    extraDelaySeconds = Math.max(0, bufferAheadSeconds - serverBufferSeconds);
    return bufferAheadSeconds;
  }

  function estimatedServerNow() {
    // Advance from the timestamp in each received SSE packet, not its local
    // arrival time. TCP may deliver several packets in one burst; the embedded
    // timestamps preserve the original 120 Hz measurement cadence.
    if (latestServerTime) return latestServerTime;
    if (hasServerClockOffset) return Date.now() + serverClockOffsetMs;
    return Date.now();
  }

  function sampleNearestTo(serverTime) {
    if (!serverSamples.length) return null;
    let low = 0;
    let high = serverSamples.length;

    while (low < high) {
      const middle = (low + high) >> 1;
      if (serverSamples[middle][1] < serverTime) low = middle + 1;
      else high = middle;
    }

    if (low <= 0) return serverSamples[0];
    if (low >= serverSamples.length) return serverSamples[serverSamples.length - 1];
    const before = serverSamples[low - 1];
    const after = serverSamples[low];
    return serverTime - before[1] <= after[1] - serverTime ? before : after;
  }

  function renderAdaptiveSafariLevel() {
    measureSafariBuffer(false);
    const desiredServerTime = estimatedServerNow() - extraDelaySeconds * 1000;
    const historyCoversTarget = !!(
      serverSamples.length && desiredServerTime >= serverSamples[0][1] - 100
    );
    const sample = historyCoversTarget
      ? sampleNearestTo(desiredServerTime)
      : serverSamples[serverSamples.length - 1];
    if (!sample || sample[0] === selectedServerSeq) return;

    selectedServerSeq = sample[0];
    targetL = dbToLedLevel(sample[2]);
    targetR = dbToLedLevel(sample[3]);
    adaptiveRenders += 1;
    renderSafariServerLevel();
    setMode(
      bufferAheadSeconds !== null && historyCoversTarget
        ? "server-adaptive"
        : "server-real"
    );
  }

  function loadServerHistory() {
    if (
      !IS_SAFARI ||
      !active ||
      historyReady ||
      historyController ||
      typeof fetch !== "function"
    ) return;
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    const requestMarker = {
      abort: function () { if (controller) controller.abort(); }
    };
    const requestStartedAt = performance.now();
    historyController = requestMarker;

    fetch(SERVER_HISTORY_URL, {
      cache: "no-store",
      credentials: "omit",
      signal: controller ? controller.signal : undefined
    }).then(function (response) {
      if (!response.ok) throw new Error("VU history HTTP " + response.status);
      return response.json();
    }).then(function (payload) {
      if (!active || historyController !== requestMarker) return;
      const roundTripMs = performance.now() - requestStartedAt;
      const generatedAt = Number(payload && payload.generatedAt);
      const bufferSeconds = Number(payload && payload.bufferSeconds);
      if (Number.isFinite(generatedAt)) {
        serverClockOffsetMs = generatedAt - (Date.now() - roundTripMs / 2);
        hasServerClockOffset = true;
      }
      if (Number.isFinite(bufferSeconds) && bufferSeconds >= 0) {
        serverBufferSeconds = bufferSeconds;
      }
      mergeServerHistory(payload && payload.items);
      historyLoads += 1;
      historyReady = true;
      historyController = null;
      measureSafariBuffer(true);
      renderAdaptiveSafariLevel();
    }).catch(function (error) {
      if (!error || error.name !== "AbortError") log("VU history unavailable; using live feed.", error);
      if (historyController === requestMarker) historyController = null;
      if (active && (!error || error.name !== "AbortError")) {
        clearTimeout(historyRetryTimer);
        historyRetryTimer = setTimeout(loadServerHistory, 2000);
      }
    });
  }

  function closeServerFeed() {
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }
    if (historyController) {
      try { historyController.abort(); } catch (_) {}
      historyController = null;
    }
    clearTimeout(historyRetryTimer);
    historyRetryTimer = null;
    historyReady = false;
    lastServerEventAt = 0;
    latestServerTime = 0;
    hasServerClockOffset = false;
    serverSamples = [];
    bufferAheadReadings = [];
    bufferAheadSeconds = null;
    extraDelaySeconds = 0;
    lastBufferMeasureAt = 0;
    selectedServerSeq = 0;
    lastServerRenderAt = 0;
  }

  function openServerFeed() {
    if (!IS_SAFARI || !active || eventSource) return;
    if (!("EventSource" in window)) {
      setMode("server-unsupported");
      return;
    }

    setMode("server-connecting");
    const source = new EventSource(SERVER_EVENTS_URL);
    eventSource = source;
    loadServerHistory();

    source.addEventListener("open", function () {
      if (eventSource !== source) return;
      setMode("server-real");
    });

    source.addEventListener("level", function (event) {
      if (eventSource !== source || !active) return;

      try {
        const data = JSON.parse(event.data);
        if (!data || data.online !== true) {
          targetL = 0;
          targetR = 0;
          renderSafariServerLevel();
          setMode("server-offline");
          return;
        }

        const sample = addLiveServerSample(data);
        if (!sample) return;
        latestServerTime = sample[1];
        serverLevelEvents += 1;
        lastServerEventAt = Date.now();
        renderAdaptiveSafariLevel();
      } catch (error) {
        log("Invalid VU SSE packet", error);
      }
    });

    source.addEventListener("error", function () {
      if (eventSource !== source) return;
      targetL = 0;
      targetR = 0;
      renderSafariServerLevel();
      setMode("server-reconnecting");
      // EventSource reconnects itself; do not create a parallel connection.
    });
  }

  function observeMainAudio(audio) {
    if (!audio || observedAudio === audio) return;

    if (observedAudio && typeof observedAudio.removeEventListener === "function") {
      observedAudio.removeEventListener("play", onMainAudioPlay);
      observedAudio.removeEventListener("playing", onMainAudioPlaying);
      observedAudio.removeEventListener("pause", onMainAudioPause);
      observedAudio.removeEventListener("ended", onMainAudioPause);
      observedAudio.removeEventListener("waiting", onMainAudioWaiting);
      observedAudio.removeEventListener("stalled", onMainAudioWaiting);
    }

    observedAudio = audio;
    if (IS_SAFARI) {
      safariPlaybackReady = !!(
        !audio.paused &&
        !audio.ended &&
        Number(audio.readyState || 0) >= 3 &&
        Number(audio.currentTime || 0) > 0
      );
    }

    if (typeof audio.addEventListener === "function") {
      audio.addEventListener("play", onMainAudioPlay);
      audio.addEventListener("playing", onMainAudioPlaying);
      audio.addEventListener("pause", onMainAudioPause);
      audio.addEventListener("ended", onMainAudioPause);
      audio.addEventListener("waiting", onMainAudioWaiting);
      audio.addEventListener("stalled", onMainAudioWaiting);
    }
  }

  function onMainAudioPlay() {
    if (IS_SAFARI) safariPlaybackReady = false;
    syncVuWithMainPlayer();
  }

  function onMainAudioPlaying() {
    if (IS_SAFARI) safariPlaybackReady = true;
    syncVuWithMainPlayer();
  }

  function onMainAudioPause() {
    if (IS_SAFARI) safariPlaybackReady = false;
    syncVuWithMainPlayer();
  }

  function onMainAudioWaiting() {
    if (IS_SAFARI) safariPlaybackReady = false;
    syncVuWithMainPlayer();
  }

  function getRms(dataArray) {
    let sum = 0;

    for (let i = 0; i < dataArray.length; i++) {
      const value = (dataArray[i] - 128) / 128;
      sum += value * value;
    }

    return Math.sqrt(sum / dataArray.length);
  }

  function approachLevel(current, target, elapsedSeconds) {
    // Attack is immediate. Decay is time-normalized so 120 Hz Safari SSE and
    // 120 Hz Brave/Chrome requestAnimationFrame have the same response.
    if (target >= current) return target;
    const seconds = Math.min(
      MAX_DECAY_STEP_SECONDS,
      Math.max(0, Number(elapsedSeconds) || 0)
    );
    return Math.max(target, current - DECAY_PER_SECOND * seconds);
  }

  function frame() {
    if (!active) return;

    const now = performance.now();
    const elapsedSeconds = lastLocalRenderAt
      ? Math.min(MAX_DECAY_STEP_SECONDS, Math.max(0, (now - lastLocalRenderAt) / 1000))
      : 1 / 120;
    lastLocalRenderAt = now;

    if (analyserL && analyserR && dataArrayL && dataArrayR) {
      analyserL.getByteTimeDomainData(dataArrayL);
      analyserR.getByteTimeDomainData(dataArrayR);

      const measuredL = Math.max(0, Math.min(18, getRms(dataArrayL) * LOCAL_GAIN));
      const measuredR = Math.max(0, Math.min(18, getRms(dataArrayR) * LOCAL_GAIN));
      lastL = approachLevel(lastL, measuredL, elapsedSeconds);
      lastR = approachLevel(lastR, measuredR, elapsedSeconds);
    } else {
      lastL = approachLevel(lastL, 0, elapsedSeconds);
      lastR = approachLevel(lastR, 0, elapsedSeconds);
    }

    setLevel("l", lastL);
    setLevel("r", lastR);
    raf = requestAnimationFrame(frame);
  }

  function startVu() {
    createVu();
    if (active) return;

    active = true;
    zeroLevels();

    if (IS_SAFARI) {
      openServerFeed();
    } else {
      resumeAudioContext();
      attachToExistingPlayer();
      cancelAnimationFrame(raf);
      frame();
    }
  }

  function stopVu() {
    active = false;
    cancelAnimationFrame(raf);
    closeServerFeed();
    zeroLevels();
    setMode(IS_SAFARI ? "server-waiting" : "local-waiting");
  }

  function syncVuWithMainPlayer() {
    const audio = getMainAudio();
    observeMainAudio(audio);

    if (IS_SAFARI && active && lastServerEventAt && Date.now() - lastServerEventAt > 2500) {
      targetL = 0;
      targetR = 0;
      zeroLevels();
      setMode("server-stale");
    }

    if (isMainPlayerPlaying()) {
      if (!active) {
        startVu();
      } else if (IS_SAFARI) {
        openServerFeed();
      } else if (!analyserL || mainAudio !== audio) {
        attachLocalAudio(audio);
      }
    } else if (active) {
      stopVu();
    }
  }

  function releasePausedSafariStream() {
    if (!IS_SAFARI) return;

    const playButton = document.getElementById("qwPlayerPlay");
    if (!playButton || playButton.getAttribute("data-state") !== "stop") return;

    const sound = getMainSound();
    if (!sound) return;

    // The Vice theme only calls pause() on Stop. With an infinite AAC stream,
    // Safari can later resume stale compressed data, causing skips, digital
    // artifacts or silence after repeated cycles. unload() closes only the
    // existing player's connection; the next Play opens a fresh stream on the
    // same SoundManager object. No additional Audio object is created.
    try {
      if (typeof sound.unload === "function") {
        sound.unload();
      } else if (sound._a) {
        sound._a.pause();
        sound._a.removeAttribute("src");
        sound._a.load();
      }
      safariStreamReleases += 1;
      safariPlaybackReady = false;
      stopVu();
      log("Safari live stream released after Stop.");
    } catch (error) {
      warn("Safari live stream could not be released after Stop.", error);
    }
  }

  function isPlayerClick(target) {
    if (!target || typeof target.closest !== "function") return false;

    return !!(
      target.closest("#QWplayerbar") ||
      target.closest("#qwPlayerbar") ||
      target.closest("#qwPlayerBar") ||
      target.closest(".qw-footer-bar") ||
      target.closest("#rc-vu-mini")
    );
  }

  function onDocumentClick(event) {
    if (!isPlayerClick(event.target)) return;

    const clickedMainPlayButton = !!(
      event.target &&
      typeof event.target.closest === "function" &&
      event.target.closest("#qwPlayerPlay")
    );

    if (!IS_SAFARI) {
      installSoundManagerCorsHook();
      resumeAudioContext();
      attachToExistingPlayer();
    } else if (clickedMainPlayButton) {
      const releaseToken = ++safariReleaseToken;
      // The capture listener runs before the theme's click handler. The microtask
      // runs after the complete click dispatch, once the theme has changed state,
      // without Safari throttling it like a background-tab setTimeout.
      const afterClick = window.queueMicrotask || function (callback) {
        Promise.resolve().then(callback);
      };
      afterClick(function () {
        if (releaseToken === safariReleaseToken) releasePausedSafariStream();
      });
    }

    // The theme creates or replaces the SoundManager audio element after the click.
    setTimeout(syncVuWithMainPlayer, 80);
    setTimeout(syncVuWithMainPlayer, 350);
  }

  function onVisibilityChange() {
    if (document.visibilityState !== "visible") return;
    if (!IS_SAFARI) resumeAudioContext();
    setTimeout(syncVuWithMainPlayer, 0);
  }

  function destroy() {
    active = false;
    cancelAnimationFrame(raf);
    clearInterval(syncTimer);
    clearInterval(hookTimer);
    safariReleaseToken += 1;
    closeServerFeed();
    zeroLevels();

    document.removeEventListener("click", onDocumentClick, true);
    document.removeEventListener("visibilitychange", onVisibilityChange);

    if (observedAudio && typeof observedAudio.removeEventListener === "function") {
      observedAudio.removeEventListener("play", onMainAudioPlay);
      observedAudio.removeEventListener("playing", onMainAudioPlaying);
      observedAudio.removeEventListener("pause", onMainAudioPause);
      observedAudio.removeEventListener("ended", onMainAudioPause);
      observedAudio.removeEventListener("waiting", onMainAudioWaiting);
      observedAudio.removeEventListener("stalled", onMainAudioWaiting);
    }
  }

  function init() {
    createVu();

    if (!IS_SAFARI && !installSoundManagerCorsHook()) {
      hookTimer = setInterval(function () {
        if (installSoundManagerCorsHook()) {
          clearInterval(hookTimer);
          hookTimer = null;
        }
      }, 250);
    }

    document.addEventListener("click", onDocumentClick, true);
    document.addEventListener("visibilitychange", onVisibilityChange);

    syncTimer = setInterval(syncVuWithMainPlayer, 500);
    syncVuWithMainPlayer();
  }

  window[RUNTIME_KEY] = {
    destroy,
    mode: IS_SAFARI ? "server-safari" : "local-browser",
    debugState: function () {
      return {
        active,
        safariPlaybackReady,
        targetL,
        targetR,
        lastL,
        lastR,
        renderedL: renderedCount.l,
        renderedR: renderedCount.r,
        safariStreamReleases,
        serverLevelEvents,
        historyLoads,
        historyReady,
        serverSamples: serverSamples.length,
        bufferAheadSeconds,
        serverBufferSeconds,
        extraDelaySeconds,
        selectedServerSeq,
        adaptiveRenders,
        serverClockOffsetMs: hasServerClockOffset ? serverClockOffsetMs : null
      };
    }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
