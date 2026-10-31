#!/usr/bin/env python3
"""Static dev server. HTTP/1.1 (http.server's 1.0 default resets reused sockets and
silently breaks ES module graphs), no caching. Usage: python3 tools/serve.py [port]"""
import http.server, sys, os
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
class H(http.server.SimpleHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()
    def log_message(self, *a): pass
port = int(sys.argv[1]) if len(sys.argv) > 1 else 8517
http.server.ThreadingHTTPServer(('127.0.0.1', port), H).serve_forever()
