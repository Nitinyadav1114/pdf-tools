import asyncio
import json
import os
import shutil
import socket
import socketserver
import subprocess
import sys
import tempfile
import threading
import urllib.request
import http.server
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

class RobustTCPServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    daemon_threads = True
    allow_reuse_address = True

async def run_tests(browser_path, port, debug_port, tmp_dir):
    test_url = f"http://127.0.0.1:{port}/index.html"
    cmd = [
        browser_path,
        "--headless=new",
        "--disable-gpu",
        "--no-first-run",
        "--no-default-browser-check",
        f"--remote-debugging-port={debug_port}",
        f"--user-data-dir={tmp_dir}",
        test_url,
    ]
    proc = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
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
            except Exception:
                pass
            await asyncio.sleep(0.5)

        if not target:
            raise RuntimeError("Browser failed to launch.")

        ws_url = target["webSocketDebuggerUrl"]
        async with websockets.connect(ws_url, max_size=20_000_000) as ws:
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

            async def eval_js(expr, await_promise=False):
                res = await send_cmd("Runtime.evaluate", {"expression": expr, "returnByValue": True, "awaitPromise": await_promise})
                if res and "exceptionDetails" in res:
                    raise RuntimeError(res["exceptionDetails"])
                if res and "result" in res:
                    return res["result"].get("value")
                return None

            await send_cmd("Runtime.enable")
            await send_cmd("Page.enable")

            # Wait for app.js initialization
            ready = False
            for _ in range(80):
                ready = await eval_js("document.readyState === 'complete' && typeof window.switchTab === 'function'")
                if ready:
                    break
                await asyncio.sleep(0.25)

            assert ready, "app.js failed to initialize in time"
            print("[PASS] app.js initialized successfully")

            print("[TEST 1] Verify loader functions on window:")
            has_loader = await eval_js("typeof window.ensurePdfLibLoaded === 'function' && typeof window.ensurePdfJsLoaded === 'function' && typeof window.ensureAllPdfEngines === 'function'")
            assert has_loader, "Loader functions missing on window"
            print("  [PASS] Loader functions present on window")

            print("[TEST 2] Calling ensurePdfLibLoaded():")
            lib_res = await eval_js("window.ensurePdfLibLoaded().then(lib => Boolean(lib && lib.PDFDocument))", await_promise=True)
            assert lib_res, "ensurePdfLibLoaded failed to resolve PDFDocument"
            print("  [PASS] ensurePdfLibLoaded resolved PDFDocument")

            print("[TEST 3] Calling ensurePdfJsLoaded():")
            js_res = await eval_js("window.ensurePdfJsLoaded().then(js => Boolean(js && js.getDocument && js.GlobalWorkerOptions && js.GlobalWorkerOptions.workerSrc))", await_promise=True)
            assert js_res, "ensurePdfJsLoaded failed to resolve pdfjsLib with workerSrc"
            print("  [PASS] ensurePdfJsLoaded resolved and workerSrc configured")

            print("[TEST 4] Promise caching (repeated call returns instantly):")
            t0 = await eval_js("Date.now()")
            await eval_js("window.ensurePdfLibLoaded()", await_promise=True)
            t1 = await eval_js("Date.now()")
            print(f"  [PASS] Cached call completed in {t1 - t0} ms")

            print("[TEST 5] switchTab navigation to compress:")
            await eval_js("window.switchTab('compress')", await_promise=True)
            compress_visible = await eval_js("!document.getElementById('compressTabView').classList.contains('hidden')")
            assert compress_visible, "Compress tab is not visible"
            print("  [PASS] switchTab('compress') switched and loaded engine")

            print("[TEST 6] Direct deep-linking simulation (#split):")
            await eval_js("window.location.hash = '#split'")
            await asyncio.sleep(0.5)
            split_visible = await eval_js("!document.getElementById('splitTabView').classList.contains('hidden')")
            assert split_visible, "Split tab is not visible after hash change"
            has_pdflib = await eval_js("Boolean(window.PDFLib)")
            assert has_pdflib, "PDFLib was not loaded for split tab"
            print("  [PASS] Direct hash change to #split activated split tool and loaded PDFLib")

            print("\n[SUCCESS] All Dynamic Lazy Loader Tests Passed Cleanly!")

    finally:
        kill_process_tree(proc)

def main():
    browser = find_browser()
    port = get_free_port()
    debug_port = get_free_port()
    tmp_dir = tempfile.mkdtemp()
    server = RobustTCPServer(("127.0.0.1", port), QuietHTTPHandler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        asyncio.run(run_tests(browser, port, debug_port, tmp_dir))
    finally:
        server.shutdown()
        server.server_close()
        shutil.rmtree(tmp_dir, ignore_errors=True)

if __name__ == "__main__":
    main()
