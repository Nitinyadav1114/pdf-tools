import urllib.request, subprocess, asyncio, websockets, tempfile, json, shutil, os
from capture_svelte_app import find_browser, kill_process_tree, get_free_port, RobustTCPServer, REPO_ROOT
import http.server

class RootHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=REPO_ROOT, **kwargs)
    def log_message(self, format, *args): pass

async def test():
    p = get_free_port()
    dp = get_free_port()
    s = RobustTCPServer(('127.0.0.1', p), RootHandler)
    import threading
    threading.Thread(target=s.serve_forever, daemon=True).start()
    tmp = tempfile.mkdtemp()
    cmd = [find_browser(), '--headless=new', f'--remote-debugging-port={dp}', f'--user-data-dir={tmp}', 'about:blank']
    proc = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    await asyncio.sleep(2)
    with urllib.request.urlopen(f'http://127.0.0.1:{dp}/json') as r:
        target = [t for t in json.loads(r.read()) if t.get('type') == 'page'][0]
    async with websockets.connect(target['webSocketDebuggerUrl']) as ws:
        msg_id = 1
        async def send(m, params=None):
            nonlocal msg_id
            msg_id += 1
            curr = msg_id
            await ws.send(json.dumps({'id': curr, 'method': m, 'params': params or {}}))
            while True:
                d = json.loads(await ws.recv())
                if d.get('id') == curr: return d.get('result')
        await send('Page.enable')
        await send('Runtime.enable')
        await send('Page.navigate', {'url': f'http://127.0.0.1:{p}/modern-preview.html#merge'})
        await asyncio.sleep(1.5)
        res = await send('Runtime.evaluate', {'expression': 'document.title', 'returnByValue': True})
        print('modern-preview.html TITLE:', res.get('result', {}).get('value'))
        h2 = await send('Runtime.evaluate', {'expression': 'document.querySelector("h2")?.innerText', 'returnByValue': True})
        print('modern-preview.html H2:', h2.get('result', {}).get('value'))
        app_len = await send('Runtime.evaluate', {'expression': 'document.getElementById("app")?.innerHTML.length', 'returnByValue': True})
        print('APP HTML LENGTH:', app_len.get('result', {}).get('value'))
        
        # Test PDF engine load from root modern-preview.html
        load_pdflib_expr = """
        (async () => {
            const script = document.createElement('script');
            script.src = 'assets/vendor/pdf-lib.min.js';
            document.head.appendChild(script);
            await new Promise((res, rej) => {
                script.onload = res;
                script.onerror = rej;
            });
            return typeof window.PDFLib !== 'undefined';
        })()
        """
        pdflib_res = await send('Runtime.evaluate', {'expression': load_pdflib_expr, 'awaitPromise': True, 'returnByValue': True})
        print('PDFLib loaded from root:', pdflib_res.get('result', {}).get('value'))
        
        # Test merging 2 documents
        pdf_merge_expr = """
        (async () => {
            const doc1 = await PDFLib.PDFDocument.create();
            doc1.addPage([400, 400]);
            const bytes1 = await doc1.save();
            const doc2 = await PDFLib.PDFDocument.create();
            doc2.addPage([500, 500]);
            const bytes2 = await doc2.save();
            const merged = await PDFLib.PDFDocument.create();
            const l1 = await PDFLib.PDFDocument.load(bytes1);
            const l2 = await PDFLib.PDFDocument.load(bytes2);
            const p1 = await merged.copyPages(l1, [0]);
            const p2 = await merged.copyPages(l2, [0]);
            merged.addPage(p1[0]);
            merged.addPage(p2[0]);
            const finalBytes = await merged.save();
            return {
                pageCount: merged.getPageCount(),
                byteLength: finalBytes.byteLength
            };
        })()
        """
        merge_res = await send('Runtime.evaluate', {'expression': pdf_merge_expr, 'awaitPromise': True, 'returnByValue': True})
        print('PDF Merge from root:', merge_res.get('result', {}).get('value'))
    kill_process_tree(proc)
    s.shutdown()
    shutil.rmtree(tmp, ignore_errors=True)

if __name__ == "__main__":
    asyncio.run(test())
