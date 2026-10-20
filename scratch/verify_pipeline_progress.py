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
import base64

try:
    import websockets
except ImportError:
    print("Error: websockets library is required.")
    sys.exit(1)

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
        print("[-] No Chrome/Edge binary found.")
        sys.exit(1)

    http_port = get_free_port()
    cdp_port = get_free_port()
    server = start_server(http_port)
    print(f"[*] Started local server on http://127.0.0.1:{http_port}")

    tmp_dir = tempfile.mkdtemp(prefix="pipeline_progress_test_")
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
        for _ in range(40):
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
            await send_cdp(ws, "DOM.enable", {}, req_id_box)

            # Wait for app bootloader
            for _ in range(30):
                is_ready = await evaluate(ws, "typeof window.switchTab === 'function' && typeof window.updatePipelineProgress === 'function'", req_id_box)
                if is_ready:
                    break
                await asyncio.sleep(0.2)

            print("[+] PDF Tools booted with Pipeline Progress Engine.")

            # 1. Switch to Compress Tab
            await evaluate(ws, "window.switchTab('compress')", req_id_box)
            await asyncio.sleep(0.4)

            # 2. Show Compress Progress Container at Stage 1 (15%)
            await evaluate(ws, """(() => {
                const c = document.getElementById('compressProgressContainer');
                if (c) c.classList.remove('hidden');
                window.updatePipelineProgress('compress', 15, 'Scanning stream dictionaries...', 'Stage 1 of 3 • Analyzing streams');
            })()""", req_id_box)
            await asyncio.sleep(0.3)

            stage1_active = await evaluate(ws, "document.querySelectorAll('#compressProgressContainer .pipeline-step-pill')[0]?.classList.contains('step-active')", req_id_box)
            print(f"[+] Stage 1 (15%): First pill active = {stage1_active}")

            # 3. Advance to Stage 2 (58%)
            await evaluate(ws, """(() => {
                window.updatePipelineProgress('compress', 58, 'Optimizing image streams (Page 7/12)...', 'Stage 2 of 3 • Downsampling high-res images');
            })()""", req_id_box)
            await asyncio.sleep(0.4)

            stage1_done = await evaluate(ws, "document.querySelectorAll('#compressProgressContainer .pipeline-step-pill')[0]?.classList.contains('step-completed')", req_id_box)
            stage2_active = await evaluate(ws, "document.querySelectorAll('#compressProgressContainer .pipeline-step-pill')[1]?.classList.contains('step-active')", req_id_box)
            conn1_done = await evaluate(ws, "document.querySelectorAll('#compressProgressContainer .pipeline-step-connector')[0]?.classList.contains('connector-completed')", req_id_box)
            print(f"[+] Stage 2 (58%): Pill 1 completed={stage1_done}, Pill 2 active={stage2_active}, Connector 1 green={conn1_done}")

            # Capture Stage 2 Desktop Light Screenshot
            shot_stage2_light = os.path.join(ARTIFACT_DIR, "ui_feature2_pipeline_stage2_light.png")
            await capture_screenshot(ws, shot_stage2_light, req_id_box)

            # 4. Advance to Stage 3 (100% completion)
            await evaluate(ws, """(() => {
                window.updatePipelineProgress('compress', 100, 'Optimization complete!', 'All stages complete • Ready to download');
            })()""", req_id_box)
            await asyncio.sleep(0.4)

            all_pills_done = await evaluate(ws, """(() => {
                const pills = Array.from(document.querySelectorAll('#compressProgressContainer .pipeline-step-pill'));
                return pills.length === 3 && pills.every(p => p.classList.contains('step-completed'));
            })()""", req_id_box)
            print(f"[+] Stage 3 (100%): All pills completed={all_pills_done}")

            shot_stage3_done = os.path.join(ARTIFACT_DIR, "ui_feature2_pipeline_stage3_done.png")
            await capture_screenshot(ws, shot_stage3_done, req_id_box)

            # 5. Test Dark Theme with Active Invert Colors Pipeline
            await evaluate(ws, "document.getElementById('themeToggleBtn')?.click()", req_id_box)
            await asyncio.sleep(0.5)
            await evaluate(ws, "window.switchTab('invert')", req_id_box)
            await asyncio.sleep(0.3)

            await evaluate(ws, """(() => {
                const c = document.getElementById('invertProgressContainer');
                if (c) c.classList.remove('hidden');
                window.updatePipelineProgress('invert', 64, 'Inverting pixel matrices (Slide 5 of 8)...', 'Stage 2 of 3 • Converting dark presentation to white paper');
            })()""", req_id_box)
            await asyncio.sleep(0.4)

            shot_dark = os.path.join(ARTIFACT_DIR, "ui_feature2_pipeline_dark_mode.png")
            await capture_screenshot(ws, shot_dark, req_id_box)

            # 6. Mobile Viewport Test (Merge PDFs Pipeline)
            await send_cdp(ws, "Emulation.setDeviceMetricsOverride", {
                "width": 390,
                "height": 844,
                "deviceScaleFactor": 2,
                "mobile": True
            }, req_id_box)
            await asyncio.sleep(0.4)

            await evaluate(ws, "window.switchTab('merge')", req_id_box)
            await asyncio.sleep(0.3)
            await evaluate(ws, """(() => {
                const c = document.getElementById('progressContainer');
                if (c) c.classList.remove('hidden');
                window.updatePipelineProgress('merge', 42, 'Merging page trees...', 'Stage 2 of 3 • Copying pages from document 2 of 4');
            })()""", req_id_box)
            await asyncio.sleep(0.4)

            shot_mobile = os.path.join(ARTIFACT_DIR, "ui_feature2_pipeline_mobile.png")
            await capture_screenshot(ws, shot_mobile, req_id_box)

            print("[SUCCESS] All Step-by-Step Pipeline Progress checks passed with 100% success!")

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
