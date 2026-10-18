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

class RobustTCPServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    daemon_threads = True
    allow_reuse_address = True

    def handle_error(self, request, client_address):
        pass

async def capture_landing_page(browser_path, port, debug_port, tmp_dir):
    test_url = f"http://127.0.0.1:{port}/index.html"
    cmd = [
        browser_path,
        "--headless=new",
        "--disable-gpu",
        "--no-first-run",
        "--no-default-browser-check",
        f"--remote-debugging-port={debug_port}",
        f"--user-data-dir={tmp_dir}",
        "--window-size=1440,1050",
        test_url,
    ]

    proc = subprocess.Popen(
        cmd,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )

    ws_url = None
    try:
        for _ in range(40):
            try:
                req = urllib.request.Request(f"http://127.0.0.1:{debug_port}/json")
                with urllib.request.urlopen(req, timeout=1) as resp:
                    tabs = json.loads(resp.read().decode("utf-8"))
                    for tab in tabs:
                        if tab.get("type") == "page" and "webSocketDebuggerUrl" in tab:
                            ws_url = tab["webSocketDebuggerUrl"]
                            break
                    if ws_url:
                        break
            except Exception:
                pass
            await asyncio.sleep(0.25)

        if not ws_url:
            raise RuntimeError(f"Could not connect to CDP on port {debug_port}")

        async with websockets.connect(ws_url, max_size=50 * 1024 * 1024) as ws:
            msg_id = 0

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
                if res and "result" in res:
                    return res["result"].get("value")
                return None

            await send_cmd("Runtime.enable")
            await send_cmd("Page.enable")

            # Wait for ready
            for _ in range(60):
                ready = await eval_js("document.readyState === 'complete' && typeof window.switchTab === 'function'")
                if ready:
                    break
                await asyncio.sleep(0.25)

            # Ensure Home tab is active
            await eval_js("window.switchTab('home')")
            await asyncio.sleep(0.5)

            # Capture Desktop Light Landing
            res = await send_cmd("Page.captureScreenshot", {"format": "png"})
            with open(os.path.join(ARTIFACT_DIR, "landing_desktop_light.png"), "wb") as f:
                f.write(base64.b64decode(res["data"]))
            print("Captured landing_desktop_light.png")

            # Capture Desktop Dark Landing
            await eval_js("document.documentElement.classList.add('dark'); document.body.classList.add('theme-dark'); document.body.classList.remove('theme-light');")
            await asyncio.sleep(0.3)
            res = await send_cmd("Page.captureScreenshot", {"format": "png"})
            with open(os.path.join(ARTIFACT_DIR, "landing_desktop_dark.png"), "wb") as f:
                f.write(base64.b64decode(res["data"]))
            print("Captured landing_desktop_dark.png")

            # Capture Full Page Dark
            res_full = await send_cmd("Page.captureScreenshot", {"format": "png", "captureBeyondViewport": True})
            with open(os.path.join(ARTIFACT_DIR, "landing_full_dark.png"), "wb") as f:
                f.write(base64.b64decode(res_full["data"]))
            print("Captured landing_full_dark.png")

            # Show Universal Router Modal
            modal_js = """
            (() => {
                const modal = document.getElementById('homeUniversalModal');
                const name = document.getElementById('homeModalFileName');
                const size = document.getElementById('homeModalFileSize');
                if (name) name.textContent = 'Confidential_Financial_Audit_2026.pdf';
                if (size) size.textContent = '4.2 MB';
                if (modal) modal.classList.remove('hidden');
            })()
            """
            await eval_js(modal_js)
            await asyncio.sleep(0.3)
            res = await send_cmd("Page.captureScreenshot", {"format": "png"})
            with open(os.path.join(ARTIFACT_DIR, "landing_universal_modal.png"), "wb") as f:
                f.write(base64.b64decode(res["data"]))
            print("Captured landing_universal_modal.png")

            # Hide modal
            await eval_js("document.getElementById('homeUniversalModal').classList.add('hidden')")
            await asyncio.sleep(0.2)

            # Mobile Viewport
            await send_cmd("Emulation.setDeviceMetricsOverride", {
                "width": 390,
                "height": 844,
                "deviceScaleFactor": 2,
                "mobile": True
            })
            await asyncio.sleep(0.5)

            # Mobile Dark Landing
            res = await send_cmd("Page.captureScreenshot", {"format": "png"})
            with open(os.path.join(ARTIFACT_DIR, "landing_mobile_dark.png"), "wb") as f:
                f.write(base64.b64decode(res["data"]))
            print("Captured landing_mobile_dark.png")

            # Mobile Light Landing
            await eval_js("document.documentElement.classList.remove('dark'); document.body.classList.add('theme-light'); document.body.classList.remove('theme-dark');")
            await asyncio.sleep(0.3)
            res = await send_cmd("Page.captureScreenshot", {"format": "png"})
            with open(os.path.join(ARTIFACT_DIR, "landing_mobile_light.png"), "wb") as f:
                f.write(base64.b64decode(res["data"]))
            print("Captured landing_mobile_light.png")

            print("\n[SUCCESS] All landing page screenshots captured successfully!")
            return True

    finally:
        kill_process_tree(proc)

def main():
    browser = find_browser()
    if not browser:
        print("ERROR: No browser found.")
        sys.exit(1)

    port = get_free_port()
    debug_port = get_free_port()
    tmp_dir = tempfile.mkdtemp(prefix="pdf_landing_shot_")

    httpd = RobustTCPServer(("127.0.0.1", port), QuietHTTPHandler)
    server_thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    server_thread.start()

    try:
        success = asyncio.run(capture_landing_page(browser, port, debug_port, tmp_dir))
        if not success:
            sys.exit(1)
    finally:
        httpd.shutdown()
        httpd.server_close()
        shutil.rmtree(tmp_dir, ignore_errors=True)

if __name__ == "__main__":
    main()
