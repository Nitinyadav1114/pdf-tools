import asyncio
import websockets
import json
import urllib.request
import subprocess
import base64
import os
import socket
import http.server
import socketserver
import threading

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def get_free_port():
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]

class QuietHTTPHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=REPO_ROOT, **kwargs)
    def log_message(self, format, *args):
        pass

async def snap():
    port = get_free_port()
    debug_port = get_free_port()
    server = socketserver.TCPServer(("127.0.0.1", port), QuietHTTPHandler)
    threading.Thread(target=server.serve_forever, daemon=True).start()

    proc = subprocess.Popen([
        r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
        "--headless=new",
        "--disable-gpu",
        f"--remote-debugging-port={debug_port}",
        "--window-size=1440,900",
        f"http://127.0.0.1:{port}/index.html"
    ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    
    try:
        await asyncio.sleep(2)
        with urllib.request.urlopen(f"http://127.0.0.1:{debug_port}/json") as r:
            target = json.loads(r.read())[0]
        ws = await websockets.connect(target["webSocketDebuggerUrl"])
        
        # Wait for app ready
        await asyncio.sleep(1)

        # Trigger share modal
        await ws.send(json.dumps({
            "id": 1,
            "method": "Runtime.evaluate",
            "params": {
                "expression": "window.openShareModal(new Blob(['hello world'], {type:'application/pdf'}), 'Quarterly_Report_Merged.pdf', 'application/pdf')",
                "awaitPromise": True
            }
        }))
        await asyncio.sleep(0.5)

        # Capture screenshot
        await ws.send(json.dumps({
            "id": 2,
            "method": "Page.captureScreenshot",
            "params": {"format": "png"}
        }))

        while True:
            msg = json.loads(await ws.recv())
            if msg.get("id") == 2:
                data = msg["result"]["data"]
                local_path = os.path.join(REPO_ROOT, "scratch", "universal_share_modal.png")
                with open(local_path, "wb") as f:
                    f.write(base64.b64decode(data))
                dest_dir = "C:/Users/Nitin Yadav/.gemini/antigravity/brain/67651b92-f1e1-4533-a44b-2da9ad7bccdf"
                dest_path = os.path.join(dest_dir, "universal_share_modal.png").replace("\\", "/")
                shutil.copy(local_path, dest_path)
                print("SAVED LOCAL:", local_path)
                print("SAVED DEST:", dest_path, os.path.exists(dest_path))
                break
    finally:
        subprocess.run(["taskkill", "/F", "/T", "/PID", str(proc.pid)], capture_output=True)
        server.shutdown()

if __name__ == "__main__":
    asyncio.run(snap())
