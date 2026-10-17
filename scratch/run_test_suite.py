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


def get_free_port():
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


class QuietHTTPHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=REPO_ROOT, **kwargs)

    def log_message(self, format, *args):
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
        test_url,
    ]

    proc = subprocess.Popen(
        cmd,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL
    )

    try:
        # Wait for CDP endpoint to become ready
        target = None
        for _ in range(30):
            try:
                with urllib.request.urlopen(f"http://127.0.0.1:{debug_port}/json", timeout=1) as resp:
                    tabs = json.loads(resp.read().decode())
                    pages = [t for t in tabs if t.get("type") == "page"]
                    if pages:
                        target = pages[0]
                        break
            except Exception:
                pass
            await asyncio.sleep(0.5)

        if not target:
            raise RuntimeError("Failed to connect to browser CDP target within timeout.")

        ws_url = target["webSocketDebuggerUrl"]
        async with websockets.connect(ws_url, max_size=10_000_000) as ws:
            # Enable Runtime to evaluate script
            await ws.send(json.dumps({"id": 1, "method": "Runtime.enable"}))
            await ws.send(json.dumps({"id": 2, "method": "Console.enable"}))

            # Poll for completion
            eval_id = 100
            for _ in range(90):
                eval_id += 1
                poll_script = (
                    "(() => {\n"
                    "  const results = window.__TEST_RESULTS__ || [];\n"
                    "  const doneEl = document.getElementById('done');\n"
                    "  return JSON.stringify({\n"
                    "    done: !!doneEl,\n"
                    "    doneText: doneEl ? doneEl.innerText : '',\n"
                    "    results: results\n"
                    "  });\n"
                    "})()"
                )
                await ws.send(json.dumps({
                    "id": eval_id,
                    "method": "Runtime.evaluate",
                    "params": {"expression": poll_script, "returnByValue": True}
                }))

                # Wait for response with matching id
                while True:
                    raw_msg = await ws.recv()
                    msg = json.loads(raw_msg)
                    if msg.get("id") == eval_id:
                        val = msg.get("result", {}).get("result", {}).get("value")
                        if val:
                            data = json.loads(val)
                            if data.get("done"):
                                return data
                        break
                await asyncio.sleep(0.5)

            raise TimeoutError("Test suite did not finish within timeout.")

    finally:
        try:
            proc.terminate()
            proc.wait(timeout=2)
        except Exception:
            proc.kill()


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
    httpd = socketserver.TCPServer(("127.0.0.1", port), QuietHTTPHandler)
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

        if failed == 0 and passed == 125:
            print("\n[SUCCESS] 100% Automated Test Suite Passed (125/125 assertions)!")
            sys.exit(0)
        else:
            print(f"\n[FAILURE] Expected 125 passed assertions, got {passed} passed, {failed} failed.", file=sys.stderr)
            sys.exit(1)

    except Exception as e:
        print(f"[FATAL] Test suite execution failed: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        sys.exit(1)
    finally:
        httpd.shutdown()
        shutil.rmtree(tmp_dir, ignore_errors=True)


if __name__ == "__main__":
    main()
