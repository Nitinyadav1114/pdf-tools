import sys
import os
import json
import urllib.request
import asyncio
import websockets
import subprocess
import threading
import http.server
import socketserver
import tempfile
import shutil

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def find_browser():
    candidates = [
        r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    ]
    for p in candidates:
        if os.path.isfile(p):
            return p
    return None

class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=REPO_ROOT, **kwargs)
    def log_message(self, *args):
        pass

async def debug_switching():
    browser = find_browser()
    port = 8765
    debug_port = 9322
    tmp_dir = tempfile.mkdtemp()
    
    server = socketserver.TCPServer(("127.0.0.1", port), QuietHandler)
    server.allow_reuse_address = True
    threading.Thread(target=server.serve_forever, daemon=True).start()

    cmd = [
        browser,
        "--headless=new",
        "--disable-gpu",
        "--no-first-run",
        "--no-default-browser-check",
        f"--remote-debugging-port={debug_port}",
        f"--user-data-dir={tmp_dir}",
        f"http://127.0.0.1:{port}/index.html"
    ]
    proc = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    try:
        await asyncio.sleep(2)
        with urllib.request.urlopen(f"http://127.0.0.1:{debug_port}/json") as resp:
            tabs = json.loads(resp.read().decode())
            target = [t for t in tabs if t.get("type") == "page"][0]
        
        async with websockets.connect(target["webSocketDebuggerUrl"]) as ws:
            msg_id = 0
            async def send_cmd(method, params=None):
                nonlocal msg_id
                msg_id += 1
                curr = msg_id
                payload = {"id": curr, "method": method}
                if params:
                    payload["params"] = params
                await ws.send(json.dumps(payload))
                while True:
                    raw = await ws.recv()
                    data = json.loads(raw)
                    if data.get("id") == curr:
                        return data

            await send_cmd("Runtime.enable")
            
            # Wait for window.switchTab
            for _ in range(40):
                res = await send_cmd("Runtime.evaluate", {"expression": "typeof window.switchTab"})
                val = res.get("result", {}).get("result", {}).get("value")
                if val == "function":
                    break
                await asyncio.sleep(0.2)

            print("window.switchTab is:", val)

            # Test calling switchTab('remove')
            res = await send_cmd("Runtime.evaluate", {
                "expression": """
                (() => {
                    try {
                        window.switchTab('remove');
                        return {
                            success: true,
                            mergeTabHidden: document.getElementById('mergeTabView').classList.contains('hidden'),
                            removeTabHidden: document.getElementById('removeTabView').classList.contains('hidden'),
                            removeTabDisplay: window.getComputedStyle(document.getElementById('removeTabView')).display,
                            mergeTabDisplay: window.getComputedStyle(document.getElementById('mergeTabView')).display
                        };
                    } catch (e) {
                        return { success: false, error: e.message, stack: e.stack };
                    }
                })()
                """,
                "returnByValue": True
            })
            print("Evaluation result:", json.dumps(res, indent=2))
    finally:
        subprocess.run(["taskkill", "/F", "/T", "/PID", str(proc.pid)], capture_output=True)
        server.shutdown()
        server.server_close()
        shutil.rmtree(tmp_dir, ignore_errors=True)

if __name__ == "__main__":
    asyncio.run(debug_switching())
