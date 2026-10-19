import sys
import os
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
import websockets

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

def kill_process_tree(proc):
    if not proc:
        return
    try:
        subprocess.run(["taskkill", "/F", "/T", "/PID", str(proc.pid)], capture_output=True, timeout=5)
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

class ThreadedTCPServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    daemon_threads = True
    allow_reuse_address = True

async def check_errors(browser_path, port, debug_port, tmp_dir):
    cmd = [
        browser_path,
        "--headless=new",
        "--disable-gpu",
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-extensions",
        f"--remote-debugging-port={debug_port}",
        f"--user-data-dir={tmp_dir}",
        "about:blank"
    ]
    proc = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        await asyncio.sleep(2)
        with urllib.request.urlopen(f"http://127.0.0.1:{debug_port}/json") as resp:
            tabs = json.loads(resp.read().decode())
            target = [t for t in tabs if t.get("type") == "page"][0]
        ws_url = target["webSocketDebuggerUrl"]
        async with websockets.connect(ws_url) as ws:
            await ws.send(json.dumps({"id": 1, "method": "Console.enable"}))
            await ws.send(json.dumps({"id": 2, "method": "Runtime.enable"}))
            await ws.send(json.dumps({"id": 3, "method": "Page.enable"}))
            
            # Navigate to index.html
            test_url = f"http://127.0.0.1:{port}/index.html"
            await ws.send(json.dumps({"id": 4, "method": "Page.navigate", "params": {"url": test_url}}))
            
            # Listen for console messages
            while True:
                try:
                    raw = await asyncio.wait_for(ws.recv(), timeout=3)
                    data = json.loads(raw)
                    if data.get("method") == "Console.messageAdded":
                        print("CONSOLE:", data["params"]["message"])
                    if data.get("method") == "Runtime.exceptionThrown":
                        print("EXCEPTION:", data["params"]["exceptionDetails"])
                    if data.get("method") == "Runtime.consoleAPICalled":
                        print("API CALLED:", data["params"]["type"], data["params"]["args"])
                except asyncio.TimeoutError:
                    break
    finally:
        kill_process_tree(proc)

def main():
    browser = find_browser()
    port = get_free_port()
    debug_port = get_free_port()
    tmp_dir = tempfile.mkdtemp()
    server = ThreadedTCPServer(("127.0.0.1", port), QuietHTTPHandler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        asyncio.run(check_errors(browser, port, debug_port, tmp_dir))
    except Exception as e:
        print("Done or Error:", e)
    finally:
        server.shutdown()
        server.server_close()
        shutil.rmtree(tmp_dir, ignore_errors=True)

if __name__ == "__main__":
    main()
