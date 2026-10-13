#!/usr/bin/env python3
"""Serve the complete Combat Lab from its own directory, from any working directory."""

import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parent
REQUIRED_FILES = ("index.html", "combat.js", "game.js", "styles.css", "favicon.svg")
CONTENT_SECURITY_POLICY = (
    "default-src 'self'; script-src 'self'; style-src 'self'; "
    "connect-src 'none'; object-src 'none'; base-uri 'none'"
)


class CombatLabHandler(SimpleHTTPRequestHandler):
    # Override host MIME databases so JS/CSS never inherit an incorrect mapping.
    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        ".html": "text/html; charset=utf-8",
        ".js": "text/javascript; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".svg": "image/svg+xml",
    }

    def end_headers(self):
        self.send_header("Content-Security-Policy", CONTENT_SECURITY_POLICY)
        self.send_header("X-Content-Type-Options", "nosniff")
        super().end_headers()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", default="127.0.0.1", help="Bind address (default: 127.0.0.1)")
    parser.add_argument("--port", type=int, default=8000, help="Port (default: 8000; 0 selects a free port)")
    args = parser.parse_args()
    if not 0 <= args.port <= 65535:
        parser.error("port must be between 0 and 65535")

    missing = [name for name in REQUIRED_FILES if not (PROJECT_ROOT / name).is_file()]
    if missing:
        parser.error("incomplete Combat Lab directory; missing: " + ", ".join(missing))

    handler = partial(CombatLabHandler, directory=str(PROJECT_ROOT))
    try:
        server = ThreadingHTTPServer((args.host, args.port), handler)
    except OSError as error:
        parser.error(f"cannot start server: {error}")

    with server:
        print(f"Combat Lab: http://{args.host}:{server.server_port}/", flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
