import os
import sys
import time
import json
import socket
import tempfile
import shutil
import subprocess
import threading
import http.server
import socketserver
import urllib.request
import asyncio
import re

try:
    import websockets
except ImportError:
    print("Error: websockets library is required.")
    sys.exit(1)

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def find_browser():
    candidates = [
        r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
        os.path.expandvars(r"%LOCALAPPDATA%\Microsoft\Edge\Application\msedge.exe"),
        os.path.expandvars(r"%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"),
    ]
    for path in candidates:
        if os.path.isfile(path):
            return path
    for name in ["msedge", "chrome", "google-chrome", "chromium"]:
        which = shutil.which(name)
        if which:
            return which
    return None

def get_free_port():
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]

class QuietHTTPHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=REPO_ROOT, **kwargs)
    def log_message(self, format, *args):
        pass

def start_server(port):
    server = socketserver.TCPServer(("127.0.0.1", port), QuietHTTPHandler)
    t = threading.Thread(target=server.serve_forever, daemon=True)
    t.start()
    return server

def extract_all_project_classes():
    html_path = os.path.join(REPO_ROOT, 'index.html')
    with open(html_path, 'r', encoding='utf-8') as f:
        html = f.read()

    classes = set()

    # Extract all classes from index.html
    for cm in re.finditer(r'class=["\']([^"\']+)["\']', html):
        for token in cm.group(1).split():
            token = token.strip()
            if any(char in token for char in ['${', '}', '=', '?', '<', '>', ';', '"', "'"]):
                continue
            if re.match(r'^[a-zA-Z0-9_\-\:\[\]\/\#\.\%]+$', token):
                classes.add(token)

    # Extract all classes from assets/js
    js_dir = os.path.join(REPO_ROOT, 'assets', 'js')
    for root, dirs, files in os.walk(js_dir):
        for file in files:
            if file.endswith('.js'):
                with open(os.path.join(root, file), 'r', encoding='utf-8') as f:
                    js = f.read()
                    for m in re.finditer(r'classList\.add\(([^)]+)\)', js):
                        for str_match in re.finditer(r'[\'"]([^\'"]+)[\'"]', m.group(1)):
                            for token in str_match.group(1).split():
                                token = token.strip()
                                if re.match(r'^[a-zA-Z0-9_\-\:\[\]\/\#\.\%]+$', token):
                                    classes.add(token)
                    for m in re.finditer(r'className\s*=\s*[\'"]([^\'"]+)[\'"]', js):
                        for token in m.group(1).split():
                            token = token.strip()
                            if re.match(r'^[a-zA-Z0-9_\-\:\[\]\/\#\.\%]+$', token):
                                classes.add(token)
                    for m in re.finditer(r'class=[\'"]([^\'"]+)[\'"]', js):
                        for token in m.group(1).split():
                            token = token.strip()
                            if any(char in token for char in ['${', '}', '=', '?', '<', '>', ';', '"', "'"]):
                                continue
                            if re.match(r'^[a-zA-Z0-9_\-\:\[\]\/\#\.\%]+$', token):
                                classes.add(token)

    return html, sorted(classes)

def minify_css(css: str) -> str:
    # Ensure separating space between comment terminator and universal selector to prevent unclosed comment traps
    css = re.sub(r'\*/\*', '*/ *', css)
    # Remove CSS comments
    css = re.sub(r'/\*[\s\S]*?\*/', '', css)
    # Normalize whitespace
    css = re.sub(r'\s+', ' ', css)
    # Remove space around delimiters
    css = re.sub(r'\s*([\{\}\:;,>~\+])\s*', r'\1', css)
    # Remove trailing semicolons before closing brace
    css = re.sub(r';\}', '}', css)
    return css.strip()

async def compile_tailwind():
    browser = find_browser()
    if not browser:
        print("Error: No Chromium-based browser found.")
        sys.exit(1)

    port = get_free_port()
    debug_port = get_free_port()
    server = start_server(port)
    print(f"[*] Started local server on http://127.0.0.1:{port}")

    html, classes = extract_all_project_classes()
    print(f"[*] Extracted {len(classes)} unique utility classes across HTML and JS modules.")

    # Extract body content from index.html
    body_match = re.search(r'<body[^>]*>([\s\S]*?)</body>', html, re.IGNORECASE)
    body_content = body_match.group(1) if body_match else ""

    classes_str = " ".join([c for c in classes if not c.startswith('.')])

    # Compiler harness HTML
    harness_path = os.path.join(REPO_ROOT, 'scratch', 'tailwind_compiler_harness.html')
    harness_content = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Tailwind Static Compilation Harness</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script id="tailwind-config">
    tailwind.config = {{
      darkMode: "class",
      theme: {{
        extend: {{
          colors: {{
            "error-container": "#ffdad6",
            "secondary": "#4648d4",
            "tertiary-fixed": "#6ffbbe",
            "on-secondary-fixed": "#07006c",
            "on-primary-fixed-variant": "#3323cc",
            "surface": "#faf8ff",
            "primary": "#3525cd",
            "slate-muted": "#64748B",
            "surface-container": "#eaedff",
            "outline": "#777587",
            "slate-bg": "#F8FAFC",
            "secondary-fixed": "#e1e0ff",
            "on-error-container": "#93000a",
            "on-error": "#ffffff",
            "surface-container-high": "#e2e7ff",
            "on-background": "#131b2e",
            "on-surface": "#131b2e",
            "on-secondary-container": "#fffbff",
            "on-tertiary-fixed": "#002113",
            "secondary-fixed-dim": "#c0c1ff",
            "primary-fixed": "#e2dfff",
            "on-surface-variant": "#464555",
            "on-secondary": "#ffffff",
            "surface-dim": "#d2d9f4",
            "background": "#faf8ff",
            "inverse-primary": "#c3c0ff",
            "tertiary-fixed-dim": "#4edea3",
            "tertiary": "#005338",
            "surface-variant": "#dae2fd",
            "on-primary": "#ffffff",
            "secondary-container": "#6063ee",
            "primary-container": "#4f46e5",
            "emerald-tint": "#ECFDF5",
            "slate-border": "#E2E8F0",
            "inverse-on-surface": "#eef0ff",
            "surface-tint": "#4d44e3",
            "surface-bright": "#faf8ff",
            "primary-fixed-dim": "#c3c0ff",
            "on-primary-container": "#dad7ff",
            "on-secondary-fixed-variant": "#2f2ebe",
            "surface-container-lowest": "#ffffff",
            "on-tertiary-fixed-variant": "#005236",
            "on-tertiary-container": "#67f4b7",
            "error": "#ba1a1a",
            "surface-container-highest": "#dae2fd",
            "tertiary-container": "#006e4b",
            "on-primary-fixed": "#0f0069",
            "outline-variant": "#c7c4d8",
            "slate-border-subtle": "#F1F5F9",
            "inverse-surface": "#283044",
            "slate-card": "#FFFFFF",
            "surface-container-low": "#f2f3ff",
            "on-tertiary": "#ffffff",
            "indigo-tint": "#EEF2FF"
          }},
          borderRadius: {{
            "DEFAULT": "0.25rem",
            "lg": "0.5rem",
            "xl": "0.75rem",
            "full": "9999px"
          }},
          fontFamily: {{
            sans: ["Plus Jakarta Sans", "sans-serif"],
            headline: ["Plus Jakarta Sans", "sans-serif"],
            body: ["Plus Jakarta Sans", "sans-serif"]
          }}
        }}
      }}
    }};
  </script>
</head>
<body class="theme-light">
  <!-- Full index.html DOM structure -->
  {body_content}

  <!-- Extended container with all JS dynamic classes -->
  <div id="compilerHarnessClasses" class="{classes_str}"></div>
</body>
</html>
"""
    with open(harness_path, 'w', encoding='utf-8') as f:
        f.write(harness_content)

    tmp_dir = tempfile.mkdtemp()
    cmd = [
        browser,
        "--headless=new",
        "--disable-gpu",
        "--no-first-run",
        "--no-default-browser-check",
        f"--remote-debugging-port={debug_port}",
        f"--user-data-dir={tmp_dir}",
        f"http://127.0.0.1:{port}/scratch/tailwind_compiler_harness.html"
    ]
    proc = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    print(f"[*] Headless browser running on CDP port {debug_port}...")

    compiled_raw_css = ""
    try:
        await asyncio.sleep(2)
        ws_url = None
        for _ in range(25):
            try:
                with urllib.request.urlopen(f"http://127.0.0.1:{debug_port}/json") as r:
                    tabs = json.loads(r.read().decode())
                    for t in tabs:
                        if "tailwind_compiler_harness.html" in t.get("url", ""):
                            ws_url = t.get("webSocketDebuggerUrl")
                            break
                    if ws_url:
                        break
            except Exception:
                pass
            await asyncio.sleep(0.4)

        if not ws_url:
            raise RuntimeError("Could not find compiler harness CDP session!")

        async with websockets.connect(ws_url) as ws:
            async def eval_js(expr):
                payload = {
                    "id": 1,
                    "method": "Runtime.evaluate",
                    "params": {"expression": expr, "returnByValue": True}
                }
                await ws.send(json.dumps(payload))
                while True:
                    msg = json.loads(await ws.recv())
                    if msg.get("id") == 1:
                        return msg.get("result", {}).get("result", {}).get("value")

            # Wait for Tailwind style generation
            for _ in range(30):
                res = await eval_js("document.querySelectorAll('style').length")
                if res and res > 0:
                    break
                await asyncio.sleep(0.5)

            styles_info = await eval_js("""
                (() => {
                    const styles = Array.from(document.querySelectorAll('style'));
                    for (const s of styles) {
                        if (s.textContent && s.textContent.length > 5000) {
                            return s.textContent;
                        }
                    }
                    return styles[0] ? styles[0].textContent : '';
                })()
            """)

            compiled_raw_css = styles_info or ""

    finally:
        try:
            if sys.platform == "win32":
                subprocess.run(["taskkill", "/F", "/T", "/PID", str(proc.pid)], capture_output=True)
            else:
                proc.terminate()
        except Exception:
            pass
        server.shutdown()
        shutil.rmtree(tmp_dir, ignore_errors=True)

    if not compiled_raw_css or len(compiled_raw_css) < 1000:
        raise RuntimeError("Failed to extract valid compiled Tailwind CSS!")

    print(f"[+] Successfully extracted {len(compiled_raw_css)} bytes of Tailwind CSS from runtime compiler.")

    # Save to assets/css/tailwind.dist.css
    minified_tailwind = minify_css(compiled_raw_css)
    tailwind_dist_path = os.path.join(REPO_ROOT, 'assets', 'css', 'tailwind.dist.css')
    with open(tailwind_dist_path, 'w', encoding='utf-8') as f:
        f.write(minified_tailwind)
    print(f"[+] Minified Tailwind CSS saved to {tailwind_dist_path} ({len(minified_tailwind)} bytes).")

    # Rebuild bundle.min.css
    print("[*] Rebuilding production stylesheet bundle (assets/css/bundle.min.css)...")
    from build_production_css import build as build_bundle
    build_bundle()

    # Verify bundle.min.css
    bundle_path = os.path.join(REPO_ROOT, 'assets', 'css', 'bundle.min.css')
    with open(bundle_path, 'r', encoding='utf-8') as f:
        bundle_content = f.read()
    print(f"[+] Final production bundle size: {len(bundle_content)} bytes ({len(bundle_content)/1024:.1f} KB).")

    return True

if __name__ == '__main__':
    asyncio.run(compile_tailwind())
