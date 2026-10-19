import sys
import os
import json
import socket
import tempfile
import urllib.request
import asyncio
import websockets
import subprocess
import shutil
import threading
import http.server
import socketserver

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def find_browser():
    candidates = [
        r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    ]
    for path in candidates:
        if os.path.isfile(path):
            return path
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

async def test_share():
    browser = find_browser()
    port = get_free_port()
    debug_port = get_free_port()
    tmp_dir = tempfile.mkdtemp()

    server = socketserver.TCPServer(("127.0.0.1", port), QuietHTTPHandler)
    server_thread = threading.Thread(target=server.serve_forever, daemon=True)
    server_thread.start()

    cmd = [
        browser,
        "--headless=new",
        "--disable-gpu",
        f"--remote-debugging-port={debug_port}",
        f"--user-data-dir={tmp_dir}",
        f"http://127.0.0.1:{port}/index.html"
    ]
    proc = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        await asyncio.sleep(2)
        target = None
        for _ in range(20):
            try:
                with urllib.request.urlopen(f"http://127.0.0.1:{debug_port}/json") as resp:
                    tabs = json.loads(resp.read().decode())
                    pages = [t for t in tabs if t.get("type") == "page"]
                    if pages:
                        target = pages[0]
                        break
            except Exception:
                pass
            await asyncio.sleep(0.5)

        ws_url = target["webSocketDebuggerUrl"]
        async with websockets.connect(ws_url) as ws:
            msg_id = 0
            async def eval_js(expr):
                nonlocal msg_id
                msg_id += 1
                await ws.send(json.dumps({
                    "id": msg_id,
                    "method": "Runtime.evaluate",
                    "params": {"expression": expr, "returnByValue": True, "awaitPromise": True}
                }))
                while True:
                    raw = await ws.recv()
                    data = json.loads(raw)
                    if data.get("id") == msg_id:
                        return data.get("result", {}).get("value")

            # Wait for app ready
            await eval_js("new Promise(r => setTimeout(r, 2000))")

            res = await eval_js("""
            (() => {
                const navShare = typeof navigator.share === 'function';
                const navCanShare = typeof navigator.canShare === 'function';
                
                let canShareFile = false;
                if (navCanShare) {
                    try {
                        const testFile = new File(['test'], 'test.pdf', { type: 'application/pdf' });
                        canShareFile = navigator.canShare({ files: [testFile] });
                    } catch(e) {
                        canShareFile = false;
                    }
                }

                // Check share buttons in DOM
                const shareBtns = [
                    'shareBtn', 'removeShareBtn', 'slidesShareBtn', 
                    'invertShareBtn', 'compressShareBtn', 'imagesShareBtn', 
                    'pdfToImagesShareBtn', 'splitShareBtn'
                ];
                
                const btnVisibility = {};
                shareBtns.forEach(id => {
                    const el = document.getElementById(id);
                    btnVisibility[id] = el ? {
                        found: true,
                        hasHiddenClass: el.classList.contains('hidden'),
                        display: window.getComputedStyle(el).display
                    } : { found: false };
                });

                return {
                    navShare,
                    navCanShare,
                    canShareFile,
                    btnVisibility
                };
            })()
            """)
            print(json.dumps(res, indent=2))
    finally:
        subprocess.run(["taskkill", "/F", "/T", "/PID", str(proc.pid)], capture_output=True)
        server.shutdown()
        shutil.rmtree(tmp_dir, ignore_errors=True)

if __name__ == "__main__":
    asyncio.run(test_share())
