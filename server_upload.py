#!/usr/bin/env python3
import http.server
import socketserver
import cgi
import os
import sys
import shutil
import json

class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # Allow local testing from the browser
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def do_GET(self):
        if self.path.startswith('/api/investigation'):
            # No investigation yet — return 204 No Content so frontend treats it as empty
            self.send_response(204)
            self.end_headers()
            return
        return super().do_GET()

    def do_POST(self):
        if self.path.startswith('/api/upload'):
            ctype, pdict = cgi.parse_header(self.headers.get('content-type', ''))
            if ctype == 'multipart/form-data':
                # Parse multipart form data
                fs = cgi.FieldStorage(fp=self.rfile, headers=self.headers,
                                      environ={'REQUEST_METHOD':'POST', 'CONTENT_TYPE': self.headers.get('content-type')})
                if 'file' not in fs:
                    self.send_response(400)
                    self.send_header('Content-Type','application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({'error':'no file field in upload'}).encode())
                    return
                fileitem = fs['file']
                filename = os.path.basename(fileitem.filename) if fileitem.filename else 'uploaded'
                uploads = os.path.join(os.getcwd(), 'uploads')
                os.makedirs(uploads, exist_ok=True)
                outpath = os.path.join(uploads, filename)
                with open(outpath, 'wb') as out:
                    shutil.copyfileobj(fileitem.file, out)
                resp = {'message':'Accepted upload','filename':filename}
                self.send_response(200)
                self.send_header('Content-Type','application/json')
                self.end_headers()
                self.wfile.write(json.dumps(resp).encode())
                print(f"Saved upload -> {outpath}")
                return
            else:
                # Unsupported content type for this endpoint
                self.send_response(400)
                self.send_header('Content-Type','application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'error':'unsupported content-type'}).encode())
                return
        # Unknown POST path
        self.send_response(404)
        self.end_headers()

if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    # Serve files from the script directory (so index.html/app.js are available)
    webroot = os.path.dirname(os.path.abspath(__file__)) or os.getcwd()
    os.chdir(webroot)
    with socketserver.ThreadingTCPServer(('', port), Handler) as httpd:
        print(f'Serving HTTP on 0.0.0.0 port {port} (http://localhost:{port}/) ...')
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print('\nShutting down')
            httpd.shutdown()
