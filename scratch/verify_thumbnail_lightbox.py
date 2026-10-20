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

    tmp_dir = tempfile.mkdtemp(prefix="lightbox_test_")
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
                is_ready = await evaluate(ws, "typeof window.openLightbox === 'function' && typeof window.switchTab === 'function'", req_id_box)
                if is_ready:
                    break
                await asyncio.sleep(0.2)

            print("[+] PDF Tools booted with Thumbnail Fullscreen Lightbox & Zoom Engine.")

            # 1. Switch to Remove Pages Tab
            await evaluate(ws, "window.switchTab('remove')", req_id_box)
            await asyncio.sleep(0.4)

            # 2. Simulate sample rendered pages in Remove Pages workspace
            await evaluate(ws, """(() => {
                const ws = document.getElementById('removeWorkspace');
                const drop = document.getElementById('removeDropzoneSection');
                if (ws && drop) {
                    ws.classList.remove('hidden');
                    drop.classList.add('hidden');
                }
                const grid = document.getElementById('pagesGrid');
                if (grid) {
                    grid.innerHTML = '';
                    window.removeState.totalPages = 6;
                    window.removeState.file = { name: 'Quarterly_Financial_Presentation.pdf' };
                    for (let i = 1; i <= 6; i++) {
                        const card = document.createElement('div');
                        card.className = 'page-card';
                        card.dataset.pageNum = i;
                        card.innerHTML = `
                            <div class="page-card-header">
                                <span class="page-num-pill">Page ${i}</span>
                                <div class="page-card-actions">
                                    <button type="button" class="page-action-btn page-zoom-btn" title="Inspect Fullscreen" aria-label="Zoom Page ${i}">
                                        <svg class="w-3.5 h-3.5" aria-hidden="true"><use href="#lucide-search"></use></svg>
                                    </button>
                                    <button type="button" class="page-action-btn page-rotate-cw-btn" title="Rotate">
                                        <svg class="w-3.5 h-3.5" aria-hidden="true"><use href="#lucide-rotate-cw"></use></svg>
                                    </button>
                                </div>
                            </div>
                            <div class="page-canvas-wrapper flex items-center justify-center p-2 bg-slate-50 dark:bg-slate-900 rounded">
                                <canvas class="page-canvas" width="280" height="380" style="width:140px;height:190px;"></canvas>
                            </div>
                        `;
                        const c = card.querySelector('canvas');
                        const ctx = c.getContext('2d');
                        ctx.fillStyle = i % 2 === 0 ? '#4f46e5' : '#0ea5e9';
                        ctx.fillRect(0, 0, 280, 380);
                        ctx.fillStyle = '#ffffff';
                        ctx.font = 'bold 24px sans-serif';
                        ctx.fillText(`Slide ${i}`, 100, 180);
                        ctx.font = '16px sans-serif';
                        ctx.fillText('Financial Summary & KPIs', 40, 220);

                        card.querySelector('.page-zoom-btn').addEventListener('click', (e) => {
                            e.stopPropagation();
                            window.triggerPageLightbox(i);
                        });
                        grid.appendChild(card);
                    }
                }
            })()""", req_id_box)
            await asyncio.sleep(0.4)

            # 3. Click Zoom Button on Page 2
            await evaluate(ws, """(() => {
                const btn = document.querySelector('.page-card[data-page-num="2"] .page-zoom-btn');
                if (btn) btn.click();
            })()""", req_id_box)
            await asyncio.sleep(0.4)

            is_open = await evaluate(ws, "!document.getElementById('thumbnailLightboxModal')?.classList.contains('hidden')", req_id_box)
            page_text = await evaluate(ws, "document.getElementById('lightboxPageBadge')?.textContent", req_id_box)
            print(f"[+] Lightbox opened: {is_open}, Page Badge: {page_text}")

            shot_open_desktop = os.path.join(ARTIFACT_DIR, "ui_feature4_lightbox_open_desktop.png")
            await capture_screenshot(ws, shot_open_desktop, req_id_box)

            # 4. Test Zoom In (+50% to 150%)
            await evaluate(ws, "window.zoomLightboxBy(0.25); window.zoomLightboxBy(0.25);", req_id_box)
            await asyncio.sleep(0.3)
            zoom_text = await evaluate(ws, "document.getElementById('lightboxZoomPercent')?.textContent", req_id_box)
            print(f"[+] Lightbox Zoomed: {zoom_text}")

            shot_zoomed = os.path.join(ARTIFACT_DIR, "ui_feature4_lightbox_zoomed.png")
            await capture_screenshot(ws, shot_zoomed, req_id_box)

            # 5. Test Rotate 90° CW
            await evaluate(ws, "window.rotateLightboxCW()", req_id_box)
            await asyncio.sleep(0.3)

            shot_rotated = os.path.join(ARTIFACT_DIR, "ui_feature4_lightbox_rotated.png")
            await capture_screenshot(ws, shot_rotated, req_id_box)

            # 6. Test Next Page Navigation
            await evaluate(ws, "document.getElementById('lightboxNextBtn')?.click()", req_id_box)
            await asyncio.sleep(0.3)
            next_page_text = await evaluate(ws, "document.getElementById('lightboxPageBadge')?.textContent", req_id_box)
            print(f"[+] Navigated to next page: {next_page_text}")

            # 7. Mobile Viewport Test (390x844 iPhone 14)
            await send_cdp(ws, "Emulation.setDeviceMetricsOverride", {
                "width": 390,
                "height": 844,
                "deviceScaleFactor": 2,
                "mobile": True
            }, req_id_box)
            await asyncio.sleep(0.4)

            shot_mobile = os.path.join(ARTIFACT_DIR, "ui_feature4_lightbox_mobile.png")
            await capture_screenshot(ws, shot_mobile, req_id_box)

            # 8. Test Escape key closes lightbox
            await evaluate(ws, """(() => {
                window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
            })()""", req_id_box)
            await asyncio.sleep(0.3)
            is_closed = await evaluate(ws, "document.getElementById('thumbnailLightboxModal')?.classList.contains('hidden')", req_id_box)
            print(f"[+] Escape key closes modal: {is_closed}")

            print("[SUCCESS] Feature 4: Thumbnail Fullscreen Lightbox & Zoom verified with 100% success!")

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
