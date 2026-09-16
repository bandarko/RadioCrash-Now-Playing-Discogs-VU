(function () {
  // ===== RC Now Playing (proxy-only) =====
  // Verzija: 2026-02-15 rc-np-proxy-v1
  // ✅ Discogs se zove ISKLJUČIVO preko WP proxyja (/wp-json/rc/v1/discogs)
  // ❌ NIKAD ne zove api.discogs.com iz browsera

  const STATS_URL = "https://live.radiocrash.net/stats?json=1&sid=1";
  const TEXT_URL  = "https://live.radiocrash.net/currentsong?sid=1";
  const POLL_MS   = 12000;

  const DISCOGS_PROXY_URL = "/wp-json/rc/v1/discogs"; // ?artist=..&title=..&type=release

  // Debug (ostavi true dok ne proradi, poslije možeš na false)
  const DEBUG = false;

  // ===== STATE =====
  let inflight = false;
  let lastDisplay = "";
  let lastLink = "";
  let lastCover = "";

  // ubij staru instancu ako postoji
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

    // 1) artist + svi tokeni
    let hit = raw.results.find(it => {
      const tt = norm(it.title);
      return tt.includes(A) && tokens.every(tok => tt.includes(tok));
    });
    if (hit) return hit;

    // 2) artist + bar pola tokena
    hit = raw.results.find(it => {
      const tt = norm(it.title);
      const matchCount = tokens.filter(tok => tt.includes(tok)).length;
      return tt.includes(A) && matchCount >= Math.max(1, Math.ceil(tokens.length / 2));
    });
    if (hit) return hit;

    // 3) fallback: najveći community.have (najčešći release)
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



/* === RC VU METER STEREO - REAL STREAM TEST + FALLBACK - 28.4.2026. === */
(function () {
  const STREAM_URL = "https://live.radiocrash.net/live.mp3";
	
const IS_MOBILE = window.matchMedia("(max-width: 900px)").matches;
if (IS_MOBILE) return;
	
	const IS_SAFARI = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
	
  let active = false;
  let raf = null;
  let syncTimer = null;

  let realReady = false;
  let realFailed = false;
  let audio = null;
  let audioCtx = null;

  let analyserL = null;
  let analyserR = null;
  let dataArrayL = null;
  let dataArrayR = null;

  let lastL = 0;
  let lastR = 0;

  const DECAY = 0.3; // brzina padanja VU-a: 0.3 = sporije, 1.0 = brže

  function createVu() {
    if (document.getElementById("rc-vu-mini")) return;

    const vu = document.createElement("div");
    vu.id = "rc-vu-mini";
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
  }

  function setLevel(ch, level) {
    const bar = document.querySelector('.rc-vu-leds[data-ch="' + ch + '"]');
    if (!bar) return;

    const leds = bar.querySelectorAll(".rc-vu-led");
    const count = Math.max(0, Math.min(leds.length, Math.round(level)));

    leds.forEach(function (led, i) {
      led.classList.toggle("on", i < count);
    });
  }

  function getRMS(dataArray) {
    let sum = 0;

    for (let i = 0; i < dataArray.length; i++) {
      const v = (dataArray[i] - 128) / 128;
      sum += v * v;
    }

    return Math.sqrt(sum / dataArray.length);
  }

  function isMainPlayerPlaying() {
    try {
      if (window.$ && $.mySound && $.mySound._a) {
        const mainAudio = $.mySound._a;
        return !mainAudio.paused && !mainAudio.ended;
      }
    } catch (_) {}
    return false;
  }

  async function initRealStream() {
    if (IS_SAFARI) {
      realReady = false;
      realFailed = true;
      return false;
    }

    if (realReady && audio) {
      try { await audio.play(); } catch (_) {}
      return true;
    }

    if (realFailed) return false;
	  
    try {
      audio = new Audio();
      audio.crossOrigin = "anonymous";
      audio.src = STREAM_URL;
      audio.preload = "auto";
      audio.volume = 1;

      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      await audioCtx.resume();

      const source = audioCtx.createMediaElementSource(audio);
      const splitter = audioCtx.createChannelSplitter(2);

      analyserL = audioCtx.createAnalyser();
      analyserR = audioCtx.createAnalyser();

      analyserL.fftSize = 256;
      analyserR.fftSize = 256;

      analyserL.smoothingTimeConstant = 0.18; // bio je 25
      analyserR.smoothingTimeConstant = 0.18; // bio je 25

      source.connect(splitter);
      splitter.connect(analyserL, 0);
      splitter.connect(analyserR, 1);

      const silentGain = audioCtx.createGain();
      silentGain.gain.value = 0;
      source.connect(silentGain);
      silentGain.connect(audioCtx.destination);

      dataArrayL = new Uint8Array(analyserL.fftSize);
      dataArrayR = new Uint8Array(analyserR.fftSize);

      await audio.play();

      realReady = true;
      console.log("RC VU: REAL STEREO STREAM MODE");
      return true;
    } catch (e) {
      realFailed = true;
      realReady = false;
      console.warn("RC VU: REAL STREAM FAILED", e);
      return false;
    }
  }

  function frame() {
    if (!active) {
      setLevel("l", 0);
      setLevel("r", 0);
      return;
    }

    if (realReady && analyserL && analyserR && dataArrayL && dataArrayR) {
      analyserL.getByteTimeDomainData(dataArrayL);
      analyserR.getByteTimeDomainData(dataArrayR);

      const rmsL = getRMS(dataArrayL);
      const rmsR = getRMS(dataArrayR);

      let levelL = Math.max(0, Math.min(18, rmsL * 24)); // koliko daleko ide VU L
      let levelR = Math.max(0, Math.min(18, rmsR * 24)); // koliko daleko ide VU R

      if (levelL < lastL) levelL = Math.max(0, lastL - DECAY);
      if (levelR < lastR) levelR = Math.max(0, lastR - DECAY);

      lastL = levelL;
      lastR = levelR;

      if (IS_SAFARI && levelL < 1.5 && levelR < 1.5) {
        const base = 5 + Math.random() * 6;
        setLevel("l", base + Math.random() * 2);
        setLevel("r", base + Math.random() * 2 - 0.6);
      } else {
        setLevel("l", levelL);
        setLevel("r", levelR);
      }
    } else {
      const base = 4 + Math.random() * 5;
      const peak = Math.random() > 0.92 ? 2 + Math.random() * 3 : 0;

      setLevel("l", base + peak + Math.random() * 1.5);
      setLevel("r", base + peak + Math.random() * 1.5 - 0.5);
    }

    raf = requestAnimationFrame(frame);
  }

  async function startVu() {
    createVu();
    if (active) return;

    active = true;
    cancelAnimationFrame(raf);

    await initRealStream();
    frame();
  }

  function stopVu() {
    active = false;
    cancelAnimationFrame(raf);

    if (audio) {
      try { audio.pause(); } catch (_) {}
    }

    lastL = 0;
    lastR = 0;

    setLevel("l", 0);
    setLevel("r", 0);
  }

  function syncVuWithMainPlayer() {
    if (isMainPlayerPlaying()) {
      if (!active) startVu();
    } else {
      if (active) stopVu();
    }
  }

  function init() {
    createVu();

    document.addEventListener("click", function (e) {
      const inPlayer =
        e.target.closest("#qwPlayerbar") ||
        e.target.closest("#qwPlayerBar") ||
        e.target.closest(".qw-footer-bar") ||
        e.target.closest("#rc-vu-mini");

      if (!inPlayer) return;
      setTimeout(startVu, 150);
    }, true);

    if (!syncTimer) {
      syncTimer = setInterval(syncVuWithMainPlayer, 500);
    }

    // 🔥 FIX: probudi VU kad se vratiš na tab
    document.addEventListener("visibilitychange", async function () {
      if (document.visibilityState !== "visible") return;

      try {
        if (audioCtx && audioCtx.state === "suspended") {
          await audioCtx.resume();
        }

        if (active) {
          cancelAnimationFrame(raf);
          frame();
        }

        if (isMainPlayerPlaying() && !active) {
          startVu();
        }
      } catch (_) {}
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();