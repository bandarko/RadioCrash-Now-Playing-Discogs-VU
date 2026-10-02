#!/usr/bin/env python3
"""Radio Crash server-side stereo level feed.

One FFmpeg process decodes the existing local Shoutcast stream and publishes
small L/R level messages over Server-Sent Events. No audio is sent by this
service and no audio is written to disk.
"""

from __future__ import annotations

import json
import math
import os
import signal
import subprocess
import sys
import threading
import time
from array import array
from collections import deque
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any


STREAM_URL = os.environ.get("RC_VU_STREAM_URL", "http://127.0.0.1:8000/live.mp3")
LISTEN_HOST = os.environ.get("RC_VU_LISTEN_HOST", "127.0.0.1")
LISTEN_PORT = int(os.environ.get("RC_VU_LISTEN_PORT", "8767"))
SAMPLE_RATE = int(os.environ.get("RC_VU_SAMPLE_RATE", "44100"))
UPDATES_PER_SECOND = int(os.environ.get("RC_VU_UPDATES_PER_SECOND", "10"))
BUFFER_SECONDS = float(os.environ.get("RC_VU_BUFFER_SECONDS", "5"))
ANALYSIS_FRAMES = int(os.environ.get("RC_VU_ANALYSIS_FRAMES", "0"))
HISTORY_SECONDS = float(os.environ.get("RC_VU_HISTORY_SECONDS", "30"))
FFMPEG_BIN = os.environ.get("RC_VU_FFMPEG", "/usr/bin/ffmpeg")


class LevelState:
    def __init__(self) -> None:
        self.condition = threading.Condition()
        self.snapshot: dict[str, Any] = {
            "seq": 0,
            "serverTime": int(time.time() * 1000),
            "online": False,
            "rmsDbL": -96.0,
            "rmsDbR": -96.0,
            "peakDbL": -96.0,
            "peakDbR": -96.0,
        }
        self.clients = 0
        self.ffmpeg_pid: int | None = None
        self.last_error = "waiting for analyser"
        self.history: deque[list[float | int]] = deque(
            maxlen=max(1, round(UPDATES_PER_SECOND * HISTORY_SECONDS))
        )

    def publish(self, levels: dict[str, float]) -> None:
        with self.condition:
            self.snapshot = {
                "seq": int(self.snapshot["seq"]) + 1,
                "serverTime": int(time.time() * 1000),
                "online": True,
                **levels,
            }
            self.history.append(
                [
                    int(self.snapshot["seq"]),
                    int(self.snapshot["serverTime"]),
                    float(self.snapshot["rmsDbL"]),
                    float(self.snapshot["rmsDbR"]),
                ]
            )
            self.last_error = ""
            self.condition.notify_all()

    def mark_offline(self, message: str) -> None:
        with self.condition:
            self.snapshot = {
                **self.snapshot,
                "serverTime": int(time.time() * 1000),
                "online": False,
                "rmsDbL": -96.0,
                "rmsDbR": -96.0,
                "peakDbL": -96.0,
                "peakDbR": -96.0,
            }
            self.last_error = message
            self.condition.notify_all()

    def current(self) -> dict[str, Any]:
        with self.condition:
            return dict(self.snapshot)

    def reset_history(self) -> None:
        with self.condition:
            self.history.clear()

    def history_payload(self) -> dict[str, Any]:
        with self.condition:
            return {
                "generatedAt": int(time.time() * 1000),
                "online": bool(self.snapshot["online"]),
                "updatesPerSecond": UPDATES_PER_SECOND,
                "bufferSeconds": BUFFER_SECONDS,
                "historySeconds": HISTORY_SECONDS,
                "items": list(self.history),
            }

    def health(self) -> dict[str, Any]:
        with self.condition:
            age_ms = int(time.time() * 1000) - int(self.snapshot["serverTime"])
            return {
                **self.snapshot,
                "ageMs": age_ms,
                "clients": self.clients,
                "ffmpegPid": self.ffmpeg_pid,
                "lastError": self.last_error,
                "streamUrl": STREAM_URL,
                "updatesPerSecond": UPDATES_PER_SECOND,
                "bufferSeconds": BUFFER_SECONDS,
                "analysisFrames": ANALYSIS_FRAMES,
                "queueDepth": len(DELAY_QUEUE),
                "historySeconds": HISTORY_SECONDS,
                "historyDepth": len(self.history),
            }


STATE = LevelState()
STOP_EVENT = threading.Event()
DELAY_QUEUE: deque[dict[str, float]] = deque()


def ffmpeg_command() -> list[str]:
    return [
        FFMPEG_BIN,
        "-nostdin",
        "-hide_banner",
        "-loglevel",
        "warning",
        "-reconnect",
        "1",
        "-reconnect_streamed",
        "1",
        "-reconnect_delay_max",
        "5",
        "-analyzeduration",
        "0",
        "-probesize",
        "32768",
        "-i",
        STREAM_URL,
        "-vn",
        "-map",
        "0:a:0",
        "-ac",
        "2",
        "-ar",
        str(SAMPLE_RATE),
        "-c:a",
        "pcm_s16le",
        "-f",
        "s16le",
        "pipe:1",
    ]


def amplitude_to_dbfs(amplitude: float) -> float:
    if amplitude <= 0:
        return -96.0
    return max(-96.0, min(0.0, 20.0 * math.log10(amplitude / 32768.0)))


def read_exact(stream: Any, size: int) -> bytes:
    chunks: list[bytes] = []
    remaining = size

    while remaining > 0 and not STOP_EVENT.is_set():
        chunk = stream.read(remaining)
        if not chunk:
            break
        chunks.append(chunk)
        remaining -= len(chunk)

    return b"".join(chunks)


def pcm_levels(data: bytes) -> dict[str, float]:
    samples = array("h")
    samples.frombytes(data)
    if sys.byteorder != "little":
        samples.byteswap()

    frame_count = len(samples) // 2
    if frame_count == 0:
        return {"rmsDbL": -96.0, "rmsDbR": -96.0, "peakDbL": -96.0, "peakDbR": -96.0}

    sum_l = 0
    sum_r = 0
    peak_l = 0
    peak_r = 0

    for index in range(0, frame_count * 2, 2):
        left = int(samples[index])
        right = int(samples[index + 1])
        sum_l += left * left
        sum_r += right * right
        peak_l = max(peak_l, abs(left))
        peak_r = max(peak_r, abs(right))

    rms_l = math.sqrt(sum_l / frame_count)
    rms_r = math.sqrt(sum_r / frame_count)
    return {
        "rmsDbL": amplitude_to_dbfs(rms_l),
        "rmsDbR": amplitude_to_dbfs(rms_r),
        "peakDbL": amplitude_to_dbfs(peak_l),
        "peakDbR": amplitude_to_dbfs(peak_r),
    }


def analyser_loop() -> None:
    samples_per_update = max(256, round(SAMPLE_RATE / UPDATES_PER_SECOND))
    bytes_per_update = samples_per_update * 2 * 2
    analysis_frames = (
        samples_per_update
        if ANALYSIS_FRAMES <= 0
        else max(1, min(samples_per_update, ANALYSIS_FRAMES))
    )
    analysis_bytes = analysis_frames * 2 * 2
    delay_frames = max(0, round(UPDATES_PER_SECOND * BUFFER_SECONDS))
    interval = 1.0 / UPDATES_PER_SECOND

    while not STOP_EVENT.is_set():
        process: subprocess.Popen[bytes] | None = None
        try:
            process = subprocess.Popen(
                ffmpeg_command(),
                stdout=subprocess.PIPE,
                stderr=None,
                bufsize=0,
            )
            STATE.ffmpeg_pid = process.pid
            DELAY_QUEUE.clear()
            STATE.reset_history()
            next_tick = time.monotonic()

            if process.stdout is None:
                raise RuntimeError("FFmpeg stdout is unavailable")

            while not STOP_EVENT.is_set():
                data = read_exact(process.stdout, bytes_per_update)
                if len(data) != bytes_per_update:
                    break

                # Chrome's AnalyserNode reads the latest 256 stereo frames.
                # The same short window gives Safari comparable, responsive
                # movement without changing the browser's actual audio path.
                DELAY_QUEUE.append(pcm_levels(data[-analysis_bytes:]))
                if len(DELAY_QUEUE) > delay_frames:
                    STATE.publish(DELAY_QUEUE.popleft())

                next_tick += interval
                delay = next_tick - time.monotonic()
                if delay <= 0:
                    next_tick = time.monotonic()
                    delay = 0
                STOP_EVENT.wait(delay)

            exit_code = process.poll()
            if not STOP_EVENT.is_set():
                STATE.mark_offline(f"FFmpeg exited with code {exit_code}")
        except Exception as error:  # Keep the service alive across stream failures.
            STATE.mark_offline(f"{type(error).__name__}: {error}")
        finally:
            STATE.ffmpeg_pid = None
            if process and process.poll() is None:
                process.terminate()
                try:
                    process.wait(timeout=3)
                except subprocess.TimeoutExpired:
                    process.kill()

        if not STOP_EVENT.wait(3):
            continue


class VuRequestHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    server_version = "RadioCrashVU/1.0"

    def log_message(self, format_string: str, *args: Any) -> None:
        sys.stderr.write("[http] " + format_string % args + "\n")

    def send_json(self, payload: dict[str, Any], status: HTTPStatus = HTTPStatus.OK) -> None:
        body = json.dumps(payload, separators=(",", ":"), allow_nan=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("Connection", "close")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:  # noqa: N802 - BaseHTTPRequestHandler API
        path = self.path.partition("?")[0]
        if path in ("/", "/health"):
            self.send_json(STATE.health())
            return

        if path == "/snapshot":
            self.send_json(STATE.current())
            return

        if path == "/history":
            self.send_json(STATE.history_payload())
            return

        if path != "/events":
            self.send_json({"error": "not found"}, HTTPStatus.NOT_FOUND)
            return

        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", "text/event-stream; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Connection", "keep-alive")
        self.send_header("X-Accel-Buffering", "no")
        self.end_headers()

        last_seq = -1
        with STATE.condition:
            STATE.clients += 1

        try:
            while not STOP_EVENT.is_set():
                with STATE.condition:
                    STATE.condition.wait_for(
                        lambda: int(STATE.snapshot["seq"]) != last_seq or STOP_EVENT.is_set(),
                        timeout=15,
                    )
                    snapshot = dict(STATE.snapshot)

                seq = int(snapshot["seq"])
                if seq == last_seq:
                    payload = ": keepalive\n\n"
                else:
                    last_seq = seq
                    data = json.dumps(snapshot, separators=(",", ":"), allow_nan=False)
                    payload = f"id: {seq}\nevent: level\ndata: {data}\n\n"

                self.wfile.write(payload.encode("utf-8"))
                self.wfile.flush()
        except (BrokenPipeError, ConnectionAbortedError, ConnectionResetError):
            pass
        finally:
            self.close_connection = True
            with STATE.condition:
                STATE.clients = max(0, STATE.clients - 1)


def main() -> None:
    analyser = threading.Thread(target=analyser_loop, name="ffmpeg-analyser", daemon=True)
    analyser.start()

    server = ThreadingHTTPServer((LISTEN_HOST, LISTEN_PORT), VuRequestHandler)
    server.daemon_threads = True

    def stop(_signum: int, _frame: Any) -> None:
        STOP_EVENT.set()
        threading.Thread(target=server.shutdown, daemon=True).start()

    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)

    print(
        f"Radio Crash VU listening on http://{LISTEN_HOST}:{LISTEN_PORT}; "
        f"source={STREAM_URL}; updates={UPDATES_PER_SECOND}/s; "
        f"analysisFrames={ANALYSIS_FRAMES or 'full'}; history={HISTORY_SECONDS}s",
        flush=True,
    )

    try:
        server.serve_forever(poll_interval=0.5)
    finally:
        STOP_EVENT.set()
        server.server_close()
        analyser.join(timeout=5)


if __name__ == "__main__":
    main()
