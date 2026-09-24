#!/usr/bin/env python3
"""Local Safari harness for the Radio Crash hybrid VU candidate."""

from __future__ import annotations

import http.client
import pathlib
import ssl
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


ROOT = pathlib.Path(__file__).resolve().parents[1]
HOST = "127.0.0.1"
PORT = 8766


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def send_bytes(self, body: bytes, content_type: str) -> None:
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:  # noqa: N802
        path = self.path.partition("?")[0]

        if path == "/tests/hybrid-vu-harness.html" or path == "/":
            body = (ROOT / "tests/hybrid-vu-harness.html").read_bytes()
            self.send_bytes(body, "text/html; charset=utf-8")
            return

        if path == "/candidate.css":
            body = (ROOT / "now-playing-discogs-vu.css").read_bytes()
            self.send_bytes(body, "text/css; charset=utf-8")
            return

        if path == "/candidate.js":
            source = (ROOT / "now-playing-discogs-vu.js").read_text()
            source = source.replace(
                'https://live.radiocrash.net/vu/events',
                f'http://{HOST}:{PORT}/vu/events',
            )
            self.send_bytes(source.encode(), "text/javascript; charset=utf-8")
            return

        if path == "/vu/events":
            self.proxy_events()
            return

        self.send_error(HTTPStatus.NOT_FOUND)

    def proxy_events(self) -> None:
        tls = ssl.create_default_context(cafile="/etc/ssl/cert.pem")
        upstream = http.client.HTTPSConnection(
            "live.radiocrash.net", timeout=30, context=tls
        )
        try:
            upstream.request(
                "GET",
                "/vu/events",
                headers={
                    "Accept": "text/event-stream",
                    "Origin": "https://radiocrash.net",
                    "User-Agent": "RadioCrash-VU-Safari-Harness/1.0",
                },
            )
            response = upstream.getresponse()
            if response.status != HTTPStatus.OK:
                self.send_error(response.status)
                return

            self.send_response(HTTPStatus.OK)
            self.send_header("Content-Type", "text/event-stream; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Connection", "keep-alive")
            self.send_header("Transfer-Encoding", "chunked")
            self.end_headers()

            while True:
                chunk = response.read(512)
                if not chunk:
                    break
                self.wfile.write(f"{len(chunk):X}\r\n".encode())
                self.wfile.write(chunk)
                self.wfile.write(b"\r\n")
                self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError, TimeoutError):
            pass
        finally:
            upstream.close()

    def log_message(self, format_string: str, *args: object) -> None:
        print("[harness] " + format_string % args, flush=True)


if __name__ == "__main__":
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"Safari harness: http://{HOST}:{PORT}/tests/hybrid-vu-harness.html", flush=True)
    server.serve_forever()
