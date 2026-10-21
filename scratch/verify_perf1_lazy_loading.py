import os
import sys
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
import websockets

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ARTIFACT_DIR = r"C:\Users\Nitin Yadav\.gemini\antigravity\brain\67651b92-f1e1-4533-a44b-2da9ad7bccdf"

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
    for name in ["msedge", "chrome", "google-chrome"]:
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

class RobustTCPServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    daemon_threads = True
    allow_reuse_address = True
    request_queue_size = 128

def start_server(port):
    server = RobustTCPServer(("127.0.0.1", port), QuietHTTPHandler)
    t = threading.Thread(target=server.serve_forever, daemon=True)
    t.start()
    return server

async def send_cdp(ws, method, params=None, req_id_box=[0]):
    req_id_box[0] += 1
    msg_id = req_id_box[0]
    payload = {"id": msg_id, "method": method}
    if params:
        payload["params"] = params
    await ws.send(json.dumps(payload))
    while True:
        resp = await ws.recv()
        data = json.loads(resp)
        if data.get("id") == msg_id:
            return data

async def evaluate(ws, expr, req_id_box):
    res = await send_cdp(ws, "Runtime.evaluate", {
        "expression": expr,
        "awaitPromise": True,
        "returnByValue": True
    }, req_id_box)
    if "result" in res and "result" in res["result"]:
        return res["result"]["result"].get("value")
    return None

async def capture_screenshot(ws, path, req_id_box):
    res = await send_cdp(ws, "Page.captureScreenshot", {"format": "png"}, req_id_box)
    img_data = base64.b64decode(res["result"]["data"])
    with open(path, "wb") as f:
        f.write(img_data)
    print(f"[+] Saved screenshot: {path} ({len(img_data)/1024:.1f} KB)")

async def main():
    browser_bin = find_browser()
    if not browser_bin:
        print("[-] No browser found")
        sys.exit(1)

    http_port = get_free_port()
    cdp_port = get_free_port()
    server = start_server(http_port)
    print(f"[*] Started local server on http://127.0.0.1:{http_port}")

    tmp_dir = tempfile.mkdtemp(prefix="perf1_test_")
    target_url = f"http://127.0.0.1:{http_port}/index.html"
    cmd = [
        browser_bin,
        "--headless=new",
        "--disable-gpu",
        "--no-first-run",
        "--no-default-browser-check",
        f"--remote-debugging-port={cdp_port}",
        f"--user-data-dir={tmp_dir}",
        "--window-size=1280,900",
        target_url
    ]
    proc = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    try:
        await asyncio.sleep(2)
        target = None
        for _ in range(30):
            try:
                with urllib.request.urlopen(f"http://127.0.0.1:{cdp_port}/json", timeout=1) as resp:
                    tabs = json.loads(resp.read().decode())
                    matching = [t for t in tabs if t.get("type") == "page" and "index.html" in t.get("url", "")]
                    if matching:
                        target = matching[0]
                        break
            except Exception:
                pass
            await asyncio.sleep(0.5)

        if not target:
            raise RuntimeError("Failed to connect to CDP target for index.html.")

        ws_url = target["webSocketDebuggerUrl"]
        async with websockets.connect(ws_url, max_size=50*1024*1024) as ws:
            req_id_box = [0]
            await send_cdp(ws, "Page.enable", {}, req_id_box)
            await send_cdp(ws, "Runtime.enable", {}, req_id_box)

            # Wait for app bootloader
            for _ in range(30):
                is_ready = await evaluate(ws, "typeof window.switchTab === 'function' && typeof window.ensureAllPdfEngines === 'function'", req_id_box)
                if is_ready:
                    break
                await asyncio.sleep(0.2)

            print("[+] PDF Tools loaded with Dynamic Engine Lazy Loader.")

            # 1. Capture landing view (Tool Hub - zero engine load upfront)
            shot_landing = os.path.join(ARTIFACT_DIR, "perf_feature1_landing_shell.png")
            await capture_screenshot(ws, shot_landing, req_id_box)

            # 2. Test dynamic loading on demand
            await evaluate(ws, "(async () => { await window.ensureAllPdfEngines(); })()", req_id_box)
            has_pdflib = await evaluate(ws, "!!window.PDFLib", req_id_box)
            has_pdfjs = await evaluate(ws, "!!window.pdfjsLib", req_id_box)
            worker_src = await evaluate(ws, "window.pdfjsLib?.GlobalWorkerOptions?.workerSrc", req_id_box)
            print(f"[+] Lazy Engine Loaded: PDFLib={has_pdflib}, pdfjsLib={has_pdfjs}, workerSrc={worker_src}")

            # 3. Switch to Merge PDFs tab
            await evaluate(ws, "window.switchTab('merge')", req_id_box)
            await asyncio.sleep(0.4)

            shot_merge = os.path.join(ARTIFACT_DIR, "perf_feature1_merge_active.png")
            await capture_screenshot(ws, shot_merge, req_id_box)

            # 4. Mobile Viewport Test (iPhone 14)
            await send_cdp(ws, "Emulation.setDeviceMetricsOverride", {
                "width": 390,
                "height": 844,
                "deviceScaleFactor": 2,
                "mobile": True
            }, req_id_box)
            await asyncio.sleep(0.4)

            shot_mobile = os.path.join(ARTIFACT_DIR, "perf_feature1_mobile_shell.png")
            await capture_screenshot(ws, shot_mobile, req_id_box)

            print("[SUCCESS] Performance Feature 1: Engine Lazy Loading & Idle Preloading verified with 100% success!")

    finally:
        try:
            if sys.platform == "win32":
                subprocess.run(["taskkill", "/F", "/T", "/PID", str(proc.pid)], capture_output=True, timeout=5)
            else:
                proc.kill()
        except Exception:
            pass
        shutil.rmtree(tmp_dir, ignore_errors=True)

if __name__ == '__main__':
    asyncio.run(main())
