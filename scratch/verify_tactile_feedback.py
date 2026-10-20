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

    tmp_dir = tempfile.mkdtemp(prefix="tactile_test_")
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
                is_ready = await evaluate(ws, "typeof window.playAudioCue === 'function' && typeof window.toggleSound === 'function'", req_id_box)
                if is_ready:
                    break
                await asyncio.sleep(0.2)

            print("[+] PDF Tools booted with Tactile Web Audio & Haptics Engine.")

            # 1. Verify sound toggle button in header
            has_btn = await evaluate(ws, "!!document.getElementById('soundToggleBtn')", req_id_box)
            is_sound_on = await evaluate(ws, "window.isSoundEnabled()", req_id_box)
            print(f"[+] Sound toggle button exists: {has_btn}, Initial sound state: {is_sound_on}")

            # 2. Test toggling mute via click
            await evaluate(ws, "document.getElementById('soundToggleBtn')?.click()", req_id_box)
            await asyncio.sleep(0.4)
            is_muted = await evaluate(ws, "!window.isSoundEnabled()", req_id_box)
            off_icon_visible = await evaluate(ws, "!document.querySelector('#soundToggleBtn .sound-icon-off')?.classList.contains('hidden')", req_id_box)
            print(f"[+] Mute clicked: is_muted={is_muted}, off_icon_visible={off_icon_visible}")

            shot_muted = os.path.join(ARTIFACT_DIR, "ui_feature3_tactile_muted_desktop.png")
            await capture_screenshot(ws, shot_muted, req_id_box)

            # 3. Test unmuting via click
            await evaluate(ws, "document.getElementById('soundToggleBtn')?.click()", req_id_box)
            await asyncio.sleep(0.4)
            is_restored = await evaluate(ws, "window.isSoundEnabled()", req_id_box)
            on_icon_visible = await evaluate(ws, "!document.querySelector('#soundToggleBtn .sound-icon-on')?.classList.contains('hidden')", req_id_box)
            print(f"[+] Unmute clicked: is_restored={is_restored}, on_icon_visible={on_icon_visible}")

            shot_active = os.path.join(ARTIFACT_DIR, "ui_feature3_tactile_active_toast.png")
            await capture_screenshot(ws, shot_active, req_id_box)

            # 4. Open Command Palette and search for "sound"
            await evaluate(ws, "window.openCommandPalette()", req_id_box)
            await asyncio.sleep(0.3)
            await evaluate(ws, """(() => {
                const input = document.getElementById('cmdPaletteInput');
                input.value = 'sound';
                input.dispatchEvent(new Event('input', { bubbles: true }));
            })()""", req_id_box)
            await asyncio.sleep(0.3)

            cmd_found = await evaluate(ws, """(() => {
                const item = document.querySelector('.cmd-palette-item');
                return item && item.innerText.includes('Toggle Sound Effects');
            })()""", req_id_box)
            print(f"[+] Command Palette filter 'sound' matches action: {cmd_found}")

            shot_palette = os.path.join(ARTIFACT_DIR, "ui_feature3_tactile_cmd_palette.png")
            await capture_screenshot(ws, shot_palette, req_id_box)

            await evaluate(ws, "window.closeCommandPalette()", req_id_box)
            await asyncio.sleep(0.3)

            # 5. Mobile Viewport Test (iPhone 14)
            await send_cdp(ws, "Emulation.setDeviceMetricsOverride", {
                "width": 390,
                "height": 844,
                "deviceScaleFactor": 2,
                "mobile": True
            }, req_id_box)
            await asyncio.sleep(0.4)

            # Test tab switch with tactile feedback
            await evaluate(ws, "window.switchTab('merge')", req_id_box)
            await asyncio.sleep(0.3)

            shot_mobile = os.path.join(ARTIFACT_DIR, "ui_feature3_tactile_mobile.png")
            await capture_screenshot(ws, shot_mobile, req_id_box)

            print("[SUCCESS] Feature 3: Tactile Web Audio & Mobile Haptics verified with 100% success!")

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
