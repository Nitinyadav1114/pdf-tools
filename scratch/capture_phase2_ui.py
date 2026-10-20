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

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ARTIFACT_DIR = r"C:\Users\Nitin Yadav\.gemini\antigravity\brain\67651b92-f1e1-4533-a44b-2da9ad7bccdf"
EDGE_PATH = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"

def get_free_port():
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=REPO_ROOT, **kwargs)
    def log_message(self, format, *args):
        pass

async def main():
    port = get_free_port()
    debug_port = get_free_port()
    server = socketserver.TCPServer(("127.0.0.1", port), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()

    tmp_dir = tempfile.mkdtemp()
    cmd = [
        EDGE_PATH,
        "--headless=new",
        "--disable-gpu",
        "--no-first-run",
        "--no-default-browser-check",
        f"--remote-debugging-port={debug_port}",
        f"--user-data-dir={tmp_dir}",
        "--window-size=1280,920",
        f"http://127.0.0.1:{port}/index.html"
    ]
    proc = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    try:
        await asyncio.sleep(2.5)
        ws_url = None
        for _ in range(25):
            try:
                with urllib.request.urlopen(f"http://127.0.0.1:{debug_port}/json") as r:
                    tabs = json.loads(r.read().decode())
                    for t in tabs:
                        if "index.html" in t.get("url", ""):
                            ws_url = t.get("webSocketDebuggerUrl")
                            break
                    if ws_url:
                        break
            except Exception:
                pass
            await asyncio.sleep(0.4)

        if not ws_url:
            print("Failed to connect to browser tab!")
            return

        import websockets
        async with websockets.connect(ws_url) as ws:
            msg_id = 1
            async def send_cmd(method, params=None):
                nonlocal msg_id
                cid = msg_id
                msg_id += 1
                p = {"id": cid, "method": method}
                if params:
                    p["params"] = params
                await ws.send(json.dumps(p))
                while True:
                    resp = json.loads(await ws.recv())
                    if resp.get("id") == cid:
                        return resp.get("result", {})

            for _ in range(40):
                r = await send_cmd("Runtime.evaluate", {"expression": "typeof window.switchTab === 'function' && typeof window.openShareModal === 'function'", "returnByValue": True})
                if r.get("result", {}).get("value"):
                    break
                await asyncio.sleep(0.3)

            async def capture_screen(filename):
                res = await send_cmd("Page.captureScreenshot", {"format": "png"})
                data = res.get("data", "")
                if data:
                    out_path = os.path.join(ARTIFACT_DIR, filename)
                    with open(out_path, "wb") as f:
                        f.write(base64.b64decode(data))
                    print(f"Captured {filename}")

            # 1. Landing Hero with Shimmer Install and Modern Cards
            await send_cmd("Runtime.evaluate", {"expression": "window.switchTab('home')"})
            await asyncio.sleep(0.6)
            await capture_screen("tactile_ui_landing_shimmer.png")

            # 2. Universal Share Modal with Save Button Shimmer
            await send_cmd("Runtime.evaluate", {"expression": """
                (() => {
                    const blob = new Blob(['%PDF-1.5 test content'], { type: 'application/pdf' });
                    window.openShareModal(blob, 'annual_financial_report.pdf', 'application/pdf');
                })()
            """})
            await asyncio.sleep(0.8)
            await capture_screen("tactile_ui_share_modal_shimmer.png")

            # 3. Close modal & switch to Merge Tab with dragover breathing state
            await send_cmd("Runtime.evaluate", {"expression": """
                window.closeShareModal();
                window.switchTab('merge');
                const dropzone = document.getElementById('mergeDropzone');
                if (dropzone) dropzone.classList.add('drag-active');
            """})
            await asyncio.sleep(0.8)
            await capture_screen("tactile_ui_merge_dropzone_breathe.png")

            # 4. Split PDF Tab (Dark mode)
            await send_cmd("Runtime.evaluate", {"expression": """
                document.body.classList.remove('theme-light');
                document.body.classList.add('theme-dark');
                document.documentElement.classList.add('dark');
                window.switchTab('split');
            """})
            await asyncio.sleep(0.8)
            await capture_screen("tactile_ui_split_dark.png")

    finally:
        subprocess.run(["taskkill", "/F", "/T", "/PID", str(proc.pid)], capture_output=True)
        server.shutdown()
        shutil.rmtree(tmp_dir, ignore_errors=True)

if __name__ == '__main__':
    asyncio.run(main())
