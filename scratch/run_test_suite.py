#!/usr/bin/env python3
"""
Automated Test Suite Runner for PDF Tools.
Executes test_suite.html in headless browser via Chrome DevTools Protocol (CDP),
captures all assertion results, prints detailed logs, and verifies that all
125 assertions pass with 100% success rate.
"""

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

try:
    import websockets
except ImportError:
    websockets = None

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


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
    # Try finding in PATH
    for name in ["msedge", "chrome", "google-chrome", "chromium"]:
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


async def run_suite_cdp(browser_path, port, debug_port, tmp_dir):
    test_url = f"http://127.0.0.1:{port}/test_suite.html"
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

    proc = subprocess.Popen(
        cmd,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL
    )

    try:
        await asyncio.sleep(2)
        # Wait for CDP endpoint to become ready
        target = None
        for _ in range(30):
            try:
                with urllib.request.urlopen(f"http://127.0.0.1:{debug_port}/json", timeout=1) as resp:
                    tabs = json.loads(resp.read().decode())
                    pages = [t for t in tabs if t.get("type") == "page"]
                    matching = [t for t in pages if "test_suite.html" in t.get("url", "")]
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
            raise RuntimeError("Failed to connect to browser CDP target within timeout.")

        ws_url = target["webSocketDebuggerUrl"]
        async with websockets.connect(ws_url, max_size=10_000_000) as ws:
            # Enable Runtime and Console to evaluate script and capture errors
            await ws.send(json.dumps({"id": 1, "method": "Runtime.enable"}))
            await ws.send(json.dumps({"id": 2, "method": "Console.enable"}))
            await ws.send(json.dumps({"id": 3, "method": "Page.enable"}))
            if "test_suite.html" not in target.get("url", ""):
                await ws.send(json.dumps({"id": 4, "method": "Page.navigate", "params": {"url": test_url}}))

            # Poll for completion
            eval_id = 100
            for step in range(120):
                eval_id += 1
                poll_script = (
                    "(() => {\n"
                    "  const results = window.__TEST_RESULTS__ || [];\n"
                    "  const doneEl = document.getElementById('done');\n"
                    "  return JSON.stringify({\n"
                    "    done: !!doneEl,\n"
                    "    doneText: doneEl ? doneEl.innerText : '',\n"
                    "    results: results,\n"
                    "    href: window.location.href,\n"
                    "    body: document.body ? document.body.innerText.slice(0, 200) : '',\n"
                    "    hasSplit: typeof window.splitState !== 'undefined',\n"
                    "    hasApp: typeof window.switchTab !== 'undefined'\n"
                    "  });\n"
                    "})()"
                )
                await ws.send(json.dumps({
                    "id": eval_id,
                    "method": "Runtime.evaluate",
                    "params": {"expression": poll_script, "returnByValue": True}
                }))

                # Wait for response with matching id with per-read timeout
                while True:
                    try:
                        raw_msg = await asyncio.wait_for(ws.recv(), timeout=5.0)
                    except asyncio.TimeoutError:
                        break
                    msg = json.loads(raw_msg)
                    if msg.get("method") == "Runtime.exceptionThrown":
                        details = msg.get("params", {}).get("exceptionDetails", {})
                        print(f"[BROWSER EXCEPTION] {details.get('text')} - {details.get('exception', {}).get('description')}", file=sys.stderr)
                    if msg.get("method") == "Runtime.consoleAPICalled":
                        args = msg.get("params", {}).get("args", [])
                        err_txt = " ".join(str(a.get("value", "")) for a in args)
                        print(f"[BROWSER LOG] {err_txt}", file=sys.stderr)
                    if msg.get("id") == eval_id:
                        val = msg.get("result", {}).get("result", {}).get("value")
                        if val:
                            data = json.loads(val)
                            print(f"[DEBUG STEP {step}] href={data.get('href')}, results={len(data.get('results', []))}, done={data.get('done')}, hasSplit={data.get('hasSplit')}, hasApp={data.get('hasApp')}, body={data.get('body')!r}", file=sys.stderr)
                            # If stuck on about:blank, explicitly trigger navigation
                            if data.get("href") == "about:blank" and step >= 2:
                                await ws.send(json.dumps({
                                    "id": 9999,
                                    "method": "Runtime.evaluate",
                                    "params": {"expression": f"window.location.href = '{test_url}';"}
                                }))
                            if data.get("done"):
                                return data
                        else:
                            print(f"[DEBUG STEP {step}] eval result empty: {msg.get('result')}", file=sys.stderr)
                        break
                await asyncio.sleep(0.5)

            raise TimeoutError("Test suite did not finish within timeout.")

    finally:
        kill_process_tree(proc)


def main():
    browser = find_browser()
    if not browser:
        print("ERROR: No compatible Chromium/Edge browser found on system.", file=sys.stderr)
        sys.exit(1)

    print(f"[*] Found browser binary: {browser}")

    port = get_free_port()
    debug_port = get_free_port()
    tmp_dir = tempfile.mkdtemp(prefix="pdf_tools_test_")

    print(f"[*] Serving repository on http://127.0.0.1:{port}")
    httpd = RobustTCPServer(("127.0.0.1", port), QuietHTTPHandler)
    server_thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    server_thread.start()

    try:
        print("[*] Launching headless browser automated test suite...")
        data = asyncio.run(run_suite_cdp(browser, port, debug_port, tmp_dir))

        results = data.get("results", [])
        done_text = data.get("doneText", "")

        print("\n" + "=" * 70)
        print(" AUTOMATED TEST SUITE EXECUTION RESULTS")
        print("=" * 70)

        passed = 0
        failed = 0
        for i, item in enumerate(results, 1):
            status = "PASS" if item.get("pass") else "FAIL"
            msg = item.get("message", "")
            print(f"[{status}] #{i:03d}: {msg}")
            if item.get("pass"):
                passed += 1
            else:
                failed += 1

        print("=" * 70)
        print(f"Summary: {passed} passed, {failed} failed, total assertions: {len(results)}")
        print(f"Banner: {done_text}")
        print("=" * 70)

        if failed == 0 and passed >= 145:
            print(f"\n[SUCCESS] 100% Automated Test Suite Passed ({passed}/{passed} assertions)!")
            sys.exit(0)
        else:
            print(f"\n[FAILURE] Expected at least 145 passed assertions with 0 failures, got {passed} passed, {failed} failed.", file=sys.stderr)
            sys.exit(1)

    except Exception as e:
        print(f"[FATAL] Test suite execution failed: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        sys.exit(1)
    finally:
        try:
            httpd.shutdown()
        finally:
            httpd.server_close()
        shutil.rmtree(tmp_dir, ignore_errors=True)


if __name__ == "__main__":
    main()
