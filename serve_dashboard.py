import http.server
import socketserver
import os
import sys
import io

# Fix Windows console Unicode encoding
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

class Tee:
    def __init__(self, *files):
        self.files = files
    def write(self, obj):
        for f in self.files:
            try:
                f.write(obj)
                f.flush()
            except Exception:
                pass
    def flush(self):
        for f in self.files:
            try:
                f.flush()
            except Exception:
                pass

# Set the serving directory to employee-dashboard/out relative to script folder
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
SERVE_DIR = os.path.join(SCRIPT_DIR, "employee-dashboard", "out")

log_file = open(os.path.join(SCRIPT_DIR, "dev_server.log"), "w", encoding="utf-8")
sys.stdout = Tee(sys.stdout, log_file)
sys.stderr = Tee(sys.stderr, log_file)

if not os.path.exists(SERVE_DIR):
    print(f"Error: The directory '{SERVE_DIR}' does not exist.")
    print("Please make sure the next.js project has been built/exported first.")
    sys.exit(1)

class CleanURLHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        # SimpleHTTPRequestHandler serves from os.getcwd() by default unless directory is specified
        super().__init__(*args, directory=SERVE_DIR, **kwargs)

    def end_headers(self):
        # Disable caching for active development/refreshing so updates show immediately
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def translate_path(self, path):
        # First let parent class translate the path inside the target directory
        translated = super().translate_path(path)
        
        # If it's a directory (and not root), check if a corresponding .html file exists outside it
        # (Next.js exports pages as file.html but also creates folders for pages with sub-routes)
        if os.path.isdir(translated):
            parent_html = translated.rstrip('/') + '.html'
            if os.path.isfile(parent_html):
                return parent_html
        
        # If path doesn't exist, check if adding '.html' matches a file
        if not os.path.exists(translated):
            if os.path.exists(translated + '.html'):
                return translated + '.html'
                
        return translated

    def send_error(self, code, message=None, explain=None):
        if code == 404:
            path_404 = os.path.join(SERVE_DIR, '404.html')
            if os.path.isfile(path_404):
                self.send_response(404)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.end_headers()
                with open(path_404, 'rb') as f:
                    self.wfile.write(f.read())
                return
        super().send_error(code, message, explain)

def run_server():
    port = 3000
    max_attempts = 10
    httpd = None
    
    for attempt in range(max_attempts):
        try:
            # Allow address reuse to quickly restart the server without port block delays
            socketserver.TCPServer.allow_reuse_address = True
            httpd = socketserver.TCPServer(("", port), CleanURLHTTPRequestHandler)
            break
        except OSError:
            print(f"⚠️ Port {port} is busy. Trying next port...")
            port += 1
            
    if not httpd:
        print("❌ Error: Could not find any open port to run the server on.")
        sys.exit(1)

    print("\n" + "="*60)
    print("🚀 PREMIUM LIGHTWEIGHT STATIC DEVELOPMENT SERVER (WFH System)")
    print("="*60)
    print(f"📂 Serving Folder : {SERVE_DIR}")
    print(f"⚡ Server Engine  : Python Built-in HTTP (No Node.js)")
    print(f"💾 RAM Footprint  : ~10MB (Extremely Lightweight!)")
    print(f"🔗 Local URL      : http://localhost:{port}")
    print("="*60)
    print("Press Ctrl+C to stop the server.\n")

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n👋 Server stopped successfully.")
        httpd.server_close()
        sys.exit(0)

if __name__ == "__main__":
    run_server()
