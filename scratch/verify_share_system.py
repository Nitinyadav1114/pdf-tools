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

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

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

def get_free_port():
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]

class QuietHTTPHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=REPO_ROOT, **kwargs)
    def log_message(self, format, *args):
        pass

async def test_share_system():
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
        "--no-first-run",
        "--no-default-browser-check",
        f"--remote-debugging-port={debug_port}",
        f"--user-data-dir={tmp_dir}",
        "--window-size=1440,900",
        f"http://127.0.0.1:{port}/index.html"
    ]
    proc = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    try:
        await asyncio.sleep(2)
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
            raise RuntimeError("CDP target not found")

        ws_url = target["webSocketDebuggerUrl"]
        async with websockets.connect(ws_url, max_size=50_000_000) as ws:
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
                res = await send_cmd("Runtime.evaluate", {
                    "expression": expr,
                    "returnByValue": True,
                    "awaitPromise": True
                })
                if res and "result" in res:
                    return res["result"].get("value")
                return None

            await send_cmd("Runtime.enable")
            await send_cmd("Page.enable")
            await send_cmd("DOM.enable")

            # Wait for app readiness
            ready = False
            for _ in range(80):
                ready = await eval_js("document.readyState === 'complete' && typeof window.switchTab === 'function'")
                if ready:
                    break
                await asyncio.sleep(0.25)

            print("\n==================================================================")
            print("[INFO] UNIVERSAL SHARE SYSTEM VERIFICATION ACROSS ALL TOOLS")
            print("==================================================================")

            # 1. Setup sample document generator
            await eval_js(r"""
            window.__createTestPdf = async function(pageCount = 2, title = "Share Test") {
                const doc = await PDFLib.PDFDocument.create();
                const font = await doc.embedFont(PDFLib.StandardFonts.HelveticaBold);
                for (let i = 1; i <= pageCount; i++) {
                    const page = doc.addPage([595.28, 841.89]);
                    page.drawText(`${title} - Page ${i}`, { x: 50, y: 750, size: 24, font });
                }
                const bytes = await doc.save();
                return new File([bytes], `${title.replace(/\s+/g, '_').toLowerCase()}.pdf`, { type: 'application/pdf' });
            };
            """)

            # 2. Test Merge Tab Share Button
            print("Testing Merge Tab Share Button...")
            merge_res = await eval_js(r"""
            (async () => {
                window.switchTab('merge');
                const f1 = await window.__createTestPdf(1, "Part1");
                const f2 = await window.__createTestPdf(1, "Part2");
                await window.handleMergeFilesAdded([f1, f2]);
                
                const mergeBtn = document.getElementById('mergeBtn');
                if (mergeBtn) mergeBtn.click();
                
                // Wait for merge completion
                for (let i = 0; i < 30; i++) {
                    await new Promise(r => setTimeout(r, 100));
                    const resCard = document.getElementById('resultCard');
                    if (resCard && !resCard.classList.contains('hidden')) break;
                }

                const shareBtn = document.getElementById('shareBtn');
                const isShareVisible = shareBtn && !shareBtn.classList.contains('hidden');
                
                // Click Share button
                if (shareBtn) shareBtn.click();
                await new Promise(r => setTimeout(r, 150));

                const modal = document.getElementById('appShareModal');
                const isModalOpen = modal && !modal.classList.contains('hidden');
                const modalFileName = document.getElementById('shareModalFileName')?.textContent;
                const modalFileSize = document.getElementById('shareModalFileSize')?.textContent;

                // Close modal
                window.closeShareModal();
                await new Promise(r => setTimeout(r, 100));

                return {
                    shareBtnVisible: isShareVisible,
                    modalOpensOnClick: isModalOpen,
                    modalFileName,
                    modalFileSize
                };
            })()
            """)
            print(f"  -> Merge Share: Visible={merge_res['shareBtnVisible']}, ModalOpens={merge_res['modalOpensOnClick']}, File={merge_res['modalFileName']} ({merge_res['modalFileSize']})")

            # 3. Test Split Tab Share Button
            print("Testing Split Tab Share Button...")
            split_res = await eval_js(r"""
            (async () => {
                window.switchTab('split');
                const doc = await window.__createTestPdf(4, "SplitDoc");
                await window.handleSplitFileSelected(doc);
                
                const extractRadio = document.getElementById('splitModeExtract');
                if (extractRadio) extractRadio.click();
                const rangeInput = document.getElementById('splitExtractRangeInput');
                if (rangeInput) {
                    rangeInput.value = '1-2';
                    rangeInput.dispatchEvent(new Event('input', { bubbles: true }));
                }

                const executeBtn = document.getElementById('executeSplitBtn');
                if (executeBtn) executeBtn.click();

                for (let i = 0; i < 30; i++) {
                    await new Promise(r => setTimeout(r, 100));
                    const resCard = document.getElementById('splitResultCard');
                    if (resCard && !resCard.classList.contains('hidden')) break;
                }

                const splitShareBtn = document.getElementById('splitShareBtn');
                const isShareVisible = splitShareBtn && !splitShareBtn.classList.contains('hidden');

                if (splitShareBtn) splitShareBtn.click();
                await new Promise(r => setTimeout(r, 150));

                const modal = document.getElementById('appShareModal');
                const isModalOpen = modal && !modal.classList.contains('hidden');
                const modalFileName = document.getElementById('shareModalFileName')?.textContent;

                // Close modal
                window.closeShareModal();

                return {
                    shareBtnVisible: isShareVisible,
                    modalOpensOnClick: isModalOpen,
                    modalFileName
                };
            })()
            """)
            print(f"  -> Split Share: Visible={split_res['shareBtnVisible']}, ModalOpens={split_res['modalOpensOnClick']}, File={split_res['modalFileName']}")

            # 4. Test Compress Tab Share Button
            print("Testing Compress Tab Share Button...")
            compress_res = await eval_js(r"""
            (async () => {
                window.switchTab('compress');
                const doc = await window.__createTestPdf(3, "CompressDoc");
                await window.handleCompressFileSelected(doc);

                const executeBtn = document.getElementById('executeCompressBtn');
                if (executeBtn) executeBtn.click();

                for (let i = 0; i < 30; i++) {
                    await new Promise(r => setTimeout(r, 100));
                    const resCard = document.getElementById('compressResultCard');
                    if (resCard && !resCard.classList.contains('hidden')) break;
                }

                const shareBtn = document.getElementById('compressShareBtn');
                const isShareVisible = shareBtn && !shareBtn.classList.contains('hidden');

                if (shareBtn) shareBtn.click();
                await new Promise(r => setTimeout(r, 150));

                const modal = document.getElementById('appShareModal');
                const isModalOpen = modal && !modal.classList.contains('hidden');
                const modalFileName = document.getElementById('shareModalFileName')?.textContent;

                // Test Copy Link inside Share Modal
                const copyBtn = document.getElementById('shareModalCopyLinkBtn');
                if (copyBtn) copyBtn.click();
                await new Promise(r => setTimeout(r, 100));
                const feedbackVisible = !document.getElementById('shareModalCopyFeedback')?.classList.contains('hidden');

                return {
                    shareBtnVisible: isShareVisible,
                    modalOpensOnClick: isModalOpen,
                    modalFileName,
                    copyLinkFeedbackWorks: feedbackVisible
                };
            })()
            """)
            print(f"  -> Compress Share: Visible={compress_res['shareBtnVisible']}, ModalOpens={compress_res['modalOpensOnClick']}, File={compress_res['modalFileName']}, CopyFeedback={compress_res['copyLinkFeedbackWorks']}")

            # Capture Screenshot of the Share Modal open
            shot_res = await send_cmd("Page.captureScreenshot", {"format": "png"})
            if shot_res and "data" in shot_res:
                import base64
                artifact_dir = r"C:\Users\Nitin Yadav\.gemini\antigravity\brain\67651b92-f1e1-4533-a44b-2da9ad7bccdf"
                shot_path = os.path.join(artifact_dir, "universal_share_modal.png")
                with open(shot_path, "wb") as f:
                    f.write(base64.b64decode(shot_res["data"]))
                print(f"[SCREENSHOT] Saved share modal screenshot to {shot_path}")

            all_ok = (
                merge_res['shareBtnVisible'] and merge_res['modalOpensOnClick'] and
                split_res['shareBtnVisible'] and split_res['modalOpensOnClick'] and
                compress_res['shareBtnVisible'] and compress_res['modalOpensOnClick'] and
                compress_res['copyLinkFeedbackWorks']
            )

            if all_ok:
                print("\n[SUCCESS] ALL SHARE BUTTON AND MODAL VERIFICATIONS PASSED 100%!")
            else:
                print("\n[WARN] Some share verifications failed.")

    finally:
        subprocess.run(["taskkill", "/F", "/T", "/PID", str(proc.pid)], capture_output=True)
        server.shutdown()
        shutil.rmtree(tmp_dir, ignore_errors=True)

if __name__ == "__main__":
    asyncio.run(test_share_system())
