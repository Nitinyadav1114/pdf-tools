import sys
import os
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
import base64

try:
    import websockets
except ImportError:
    websockets = None

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ARTIFACT_DIR = r"C:\Users\Nitin Yadav\.gemini\antigravity\brain\67651b92-f1e1-4533-a44b-2da9ad7bccdf"

def find_browser():
    candidates = [
        r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    ]
    for path in candidates:
        if os.path.isfile(path):
            return path
    for name in ["msedge", "chrome"]:
        which = shutil.which(name)
        if which:
            return which
    return None

def kill_process_tree(proc):
    if not proc:
        return
    try:
        if sys.platform == "win32":
            subprocess.run(["taskkill", "/F", "/T", "/PID", str(proc.pid)], capture_output=True, timeout=5)
        else:
            proc.terminate()
            proc.wait(timeout=2)
    except Exception:
        try:
            proc.kill()
        except Exception:
            pass

def get_free_port():
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]

class QuietHTTPHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=REPO_ROOT, **kwargs)

    def log_message(self, format, *args):
        pass

    def handle(self):
        try:
            super().handle()
        except (ConnectionResetError, ConnectionAbortedError, BrokenPipeError):
            pass

class RobustTCPServer(socketserver.TCPServer):
    allow_reuse_address = True
    def handle_error(self, request, client_address):
        pass

async def capture_screenshots(browser_path, port, debug_port, tmp_dir):
    test_url = f"http://127.0.0.1:{port}/index.html"
    cmd = [
        browser_path,
        "--headless=new",
        "--disable-gpu",
        "--no-first-run",
        "--no-default-browser-check",
        f"--remote-debugging-port={debug_port}",
        f"--user-data-dir={tmp_dir}",
        "--window-size=1440,900",
        test_url,
    ]

    proc = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    try:
        await asyncio.sleep(2)
        target = None
        for _ in range(30):
            try:
                with urllib.request.urlopen(f"http://127.0.0.1:{debug_port}/json", timeout=1) as resp:
                    tabs = json.loads(resp.read().decode())
                    pages = [t for t in tabs if t.get("type") == "page"]
                    matching = [t for t in pages if "index.html" in t.get("url", "")]
                    if matching:
                        target = matching[0]
                        break
                    elif pages:
                        target = pages[0]
                        break
            except Exception:
                pass
            await asyncio.sleep(0.5)

        if not target:
            raise RuntimeError("Failed to connect to browser CDP target.")

        ws_url = target["webSocketDebuggerUrl"]
        async with websockets.connect(ws_url, max_size=20_000_000) as ws:
            await ws.send(json.dumps({"id": 1, "method": "Runtime.enable"}))
            await ws.send(json.dumps({"id": 2, "method": "Page.enable"}))
            await ws.send(json.dumps({"id": 3, "method": "Console.enable"}))

            msg_id = 100

            async def send_cmd(method, params=None):
                nonlocal msg_id
                msg_id += 1
                curr_id = msg_id
                payload = {"id": curr_id, "method": method}
                if params:
                    payload["params"] = params
                await ws.send(json.dumps(payload))
                while True:
                    raw = await ws.recv()
                    data = json.loads(raw)
                    if data.get("id") == curr_id:
                        return data.get("result")

            async def eval_js(expr):
                res = await send_cmd("Runtime.evaluate", {"expression": expr, "returnByValue": True, "awaitPromise": True})
                if res and "exceptionDetails" in res:
                    print(f"JS EXCEPTION for [{expr[:60]}]:", res["exceptionDetails"].get("text"), res["exceptionDetails"].get("exception", {}).get("description"))
                return res.get("result", {}).get("value")

            # Wait for page ready
            ready = False
            for i in range(60):
                ready = await eval_js("document.readyState === 'complete' && typeof window.switchTab === 'function'")
                if ready:
                    print(f"Page and window.switchTab ready after {i * 0.25:.2f}s")
                    break
                await asyncio.sleep(0.25)

            if not ready:
                print("WARNING: window.switchTab not ready in time!")

            # Check for console errors or horizontal overflow
            body_overflow = await eval_js("document.documentElement.scrollWidth > window.innerWidth")
            print(f"Desktop horizontal scroll overflow: {body_overflow}")

            # Capture Desktop Light
            res = await send_cmd("Page.captureScreenshot", {"format": "png"})
            with open(os.path.join(ARTIFACT_DIR, "live_desktop_light.png"), "wb") as f:
                f.write(base64.b64decode(res["data"]))
            print("Captured live_desktop_light.png")

            # Switch to dark
            await eval_js("document.documentElement.classList.add('dark'); document.body.classList.add('theme-dark'); document.body.classList.remove('theme-light');")
            await asyncio.sleep(0.3)
            res = await send_cmd("Page.captureScreenshot", {"format": "png"})
            with open(os.path.join(ARTIFACT_DIR, "live_desktop_dark.png"), "wb") as f:
                f.write(base64.b64decode(res["data"]))
            print("Captured live_desktop_dark.png")

            # Emulate Mobile Viewport: 390 x 844 (iPhone 12/13/14)
            await send_cmd("Emulation.setDeviceMetricsOverride", {
                "width": 390,
                "height": 844,
                "deviceScaleFactor": 2,
                "mobile": True
            })
            await asyncio.sleep(0.5)

            mobile_overflow = await eval_js("document.documentElement.scrollWidth > window.innerWidth")
            print(f"Mobile horizontal scroll overflow: {mobile_overflow}")

            # Mobile Dark
            res = await send_cmd("Page.captureScreenshot", {"format": "png"})
            with open(os.path.join(ARTIFACT_DIR, "live_mobile_dark.png"), "wb") as f:
                f.write(base64.b64decode(res["data"]))
            print("Captured live_mobile_dark.png")

            # Mobile Light
            await eval_js("document.documentElement.classList.remove('dark'); document.body.classList.add('theme-light'); document.body.classList.remove('theme-dark');")
            await asyncio.sleep(0.3)
            res = await send_cmd("Page.captureScreenshot", {"format": "png"})
            with open(os.path.join(ARTIFACT_DIR, "live_mobile_light.png"), "wb") as f:
                f.write(base64.b64decode(res["data"]))
            print("Captured live_mobile_light.png")

            # Let's also check each tab in mobile light!
            for tab_id in ['remove', 'slides', 'invert', 'compress', 'images', 'pdftoimages']:
                await eval_js(f"window.switchTab('{tab_id}')")
                await asyncio.sleep(0.3)
                view_id = 'pdfToImagesTabView' if tab_id == 'pdftoimages' else f'{tab_id}TabView'
                is_visible = await eval_js(f"!document.getElementById('{view_id}').classList.contains('hidden')")
                print(f"Switched to {tab_id}: visible={is_visible}")
                res = await send_cmd("Page.captureScreenshot", {"format": "png"})
                with open(os.path.join(ARTIFACT_DIR, f"live_mobile_{tab_id}.png"), "wb") as f:
                    f.write(base64.b64decode(res["data"]))
                print(f"Captured live_mobile_{tab_id}.png")

    finally:
        kill_process_tree(proc)

def main():
    browser_path = find_browser()
    if not browser_path:
        print("No browser found.")
        return 1

    port = get_free_port()
    debug_port = get_free_port()
    tmp_dir = tempfile.mkdtemp(prefix="ui_cap_")

    server = RobustTCPServer(("127.0.0.1", port), QuietHTTPHandler)
    server_thread = threading.Thread(target=server.serve_forever, daemon=True)
    server_thread.start()

    try:
        asyncio.run(capture_screenshots(browser_path, port, debug_port, tmp_dir))
    finally:
        server.shutdown()
        server.server_close()
        shutil.rmtree(tmp_dir, ignore_errors=True)

if __name__ == "__main__":
    main()
