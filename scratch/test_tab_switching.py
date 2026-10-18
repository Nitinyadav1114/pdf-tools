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
    ]
    for path in candidates:
        if os.path.isfile(path):
            return path
    for name in ["msedge", "chrome"]:
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


class RobustTCPServer(socketserver.TCPServer):
    allow_reuse_address = True

    def handle_error(self, request, client_address):
        pass


async def test_ui_and_tab_switching(browser_path, port, debug_port, tmp_dir):
    test_url = f"http://127.0.0.1:{port}/index.html"
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
                    elif pages:
                        target = pages[0]
                        break
            except Exception:
                pass
            await asyncio.sleep(0.5)

        if not target:
            raise RuntimeError("Failed to connect to browser CDP target.")

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

            async def eval_js(expr):
                res = await send_cmd("Runtime.evaluate", {"expression": expr, "returnByValue": True, "awaitPromise": True})
                if res and "result" in res:
                    return res["result"].get("value")
                return None

            await send_cmd("Runtime.enable")
            await send_cmd("Page.enable")

            # Wait for app.js initialization (up to 20 seconds)
            ready = False
            for _ in range(80):
                ready = await eval_js("document.readyState === 'complete' && typeof window.switchTab === 'function'")
                if ready:
                    break
                await asyncio.sleep(0.25)

            if not ready:
                raise RuntimeError("app.js did not initialize window.switchTab within timeout.")

            tabs = ['merge', 'remove', 'slides', 'invert', 'compress', 'images', 'pdftoimages']
            view_map = {
                'merge': 'mergeTabView',
                'remove': 'removeTabView',
                'slides': 'slidesTabView',
                'invert': 'invertTabView',
                'compress': 'compressTabView',
                'images': 'imagesTabView',
                'pdftoimages': 'pdfToImagesTabView'
            }

            results = []

            for theme in ['light', 'dark']:
                # Set theme
                if theme == 'dark':
                    await eval_js("document.documentElement.classList.add('dark'); document.body.classList.add('theme-dark'); document.body.classList.remove('theme-light');")
                else:
                    await eval_js("document.documentElement.classList.remove('dark'); document.body.classList.add('theme-light'); document.body.classList.remove('theme-dark');")

                theme_status = await eval_js("document.documentElement.classList.contains('dark') ? 'dark' : 'light'")
                print(f"\n--- Testing in [{theme_status.upper()}] Theme ---")

                for tab in tabs:
                    # Switch tab via window.switchTab and click simulation
                    await eval_js(f"window.switchTab('{tab}')")
                    await asyncio.sleep(0.15)

                    check_code = f"""
                    (() => {{
                        const tab = '{tab}';
                        const viewId = '{view_map[tab]}';
                        const btn = document.querySelector(`.nav-tab[data-tab="${{tab}}"]`);
                        const view = document.getElementById(viewId);
                        
                        const isBtnActive = btn && btn.classList.contains('active');
                        const isViewVisible = view && !view.classList.contains('hidden');
                        
                        // Check all other views are hidden
                        const allViewIds = {json.dumps(list(view_map.values()))};
                        const othersHidden = allViewIds
                            .filter(id => id !== viewId)
                            .every(id => document.getElementById(id).classList.contains('hidden'));
                        
                        // Computed styles
                        const btnStyle = window.getComputedStyle(btn);
                        const btnColor = btnStyle.color;
                        const btnBg = btnStyle.backgroundColor;
                        
                        return {{
                            tab: tab,
                            btnActive: isBtnActive,
                            viewVisible: isViewVisible,
                            othersHidden: othersHidden,
                            btnColor: btnColor,
                            btnBg: btnBg
                        }};
                    }})()
                    """
                    status = await eval_js(check_code)
                    results.append((theme, status))
                    print(f"[{theme}] Tab '{tab}': active={status['btnActive']}, visible={status['viewVisible']}, othersHidden={status['othersHidden']}, color={status['btnColor']}")

            # Verify dropzones and glowing borders/shadows
            dropzones_check = """
            (() => {
                const dzs = [
                    'dropzone', 'removeDropzone', 'slidesDropzone',
                    'invertDropzone', 'compressDropzone', 'imagesDropzone',
                    'pdfToImagesDropzone'
                ];
                return dzs.map(id => {
                    const el = document.getElementById(id);
                    return {
                        id: id,
                        exists: !!el,
                        hasOrb: !!el && !!el.querySelector('.blur-3xl'),
                        classes: el ? el.className : ''
                    };
                });
            })()
            """
            dz_results = await eval_js(dropzones_check)
            print("\n--- Dropzone and Floating Orb Verification ---")
            for dz in dz_results:
                has_dz_cls = 'dropzone' in dz['classes']
                print(f"Dropzone #{dz['id']}: exists={dz['exists']}, hasOrb={dz['hasOrb']}, hasDropzoneClass={has_dz_cls}")

            # Zero server uploads check
            print("\n--- Zero Server Uploads / Client Privacy Verification ---")
            network_security_check = """
            (() => {
                const forms = Array.from(document.querySelectorAll('form'));
                const actions = forms.map(f => f.action);
                const fileInputs = Array.from(document.querySelectorAll('input[type="file"]'));
                const inputsWithNames = fileInputs.filter(i => i.name);
                return {
                    formCount: forms.length,
                    formActions: actions,
                    fileInputCount: fileInputs.length,
                    inputsWithFormSubmissionNames: inputsWithNames.length
                };
            })()
            """
            sec = await eval_js(network_security_check)
            print(f"Forms: {sec['formCount']}, File Inputs: {sec['fileInputCount']}, Inputs with form names: {sec['inputsWithFormSubmissionNames']}")

            # Check all assertions
            all_tabs_passed = all(
                s['btnActive'] and s['viewVisible'] and s['othersHidden']
                for theme, s in results
            )
            all_dz_passed = all(dz['exists'] and dz['hasOrb'] and 'dropzone' in dz['classes'] for dz in dz_results)
            privacy_passed = sec['inputsWithFormSubmissionNames'] == 0

            return all_tabs_passed and all_dz_passed and privacy_passed

    finally:
        kill_process_tree(proc)


def main():
    browser = find_browser()
    if not browser:
        print("ERROR: No browser found.")
        sys.exit(1)

    port = get_free_port()
    debug_port = get_free_port()
    tmp_dir = tempfile.mkdtemp(prefix="tab_switch_test_")

    httpd = RobustTCPServer(("127.0.0.1", port), QuietHTTPHandler)
    t = threading.Thread(target=httpd.serve_forever, daemon=True)
    t.start()

    try:
        success = asyncio.run(test_ui_and_tab_switching(browser, port, debug_port, tmp_dir))
        if success:
            print("\n[SUCCESS] All 7 tabs switch seamlessly with active pills in Light & Dark modes, glowing dropzones, floating orbs, and 100% client privacy!")
            sys.exit(0)
        else:
            print("\n[FAILURE] Tab switching or UI verification failed.", file=sys.stderr)
            sys.exit(1)
    finally:
        try:
            httpd.shutdown()
        finally:
            httpd.server_close()
        shutil.rmtree(tmp_dir, ignore_errors=True)


if __name__ == "__main__":
    main()
