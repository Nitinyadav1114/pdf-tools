import urllib.request, subprocess, asyncio, websockets, tempfile, json, shutil, os, sys
from capture_svelte_app import find_browser, kill_process_tree, get_free_port, RobustTCPServer, REPO_ROOT
import http.server

class RootHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=REPO_ROOT, **kwargs)
    def log_message(self, format, *args): pass

async def test_primary_index():
    p = get_free_port()
    dp = get_free_port()
    s = RobustTCPServer(('127.0.0.1', p), RootHandler)
    import threading
    threading.Thread(target=s.serve_forever, daemon=True).start()
    tmp = tempfile.mkdtemp(prefix="primary_index_verify_")
    cmd = [
        find_browser(),
        '--headless=new',
        f'--remote-debugging-port={dp}',
        f'--user-data-dir={tmp}',
        'about:blank'
    ]
    proc = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    await asyncio.sleep(2)
    with urllib.request.urlopen(f'http://127.0.0.1:{dp}/json') as r:
        target = [t for t in json.loads(r.read()) if t.get('type') == 'page'][0]
        
    passed = 0
    failed = 0
    def log_p(m):
        nonlocal passed
        passed += 1
        print(f"[PASS] {m}")
    def log_f(m):
        nonlocal failed
        failed += 1
        print(f"[FAIL] {m}")

    async with websockets.connect(target['webSocketDebuggerUrl']) as ws:
        msg_id = 1
        console_errors = []
        async def send(m, params=None):
            nonlocal msg_id
            msg_id += 1
            curr = msg_id
            await ws.send(json.dumps({'id': curr, 'method': m, 'params': params or {}}))
            while True:
                d = json.loads(await ws.recv())
                if d.get('method') == 'Runtime.consoleAPICalled':
                    if d.get('params', {}).get('type') in ['error', 'assert']:
                        args = [a.get('value') or a.get('description') for a in d.get('params',{}).get('args',[])]
                        console_errors.append(f"Console error: {args}")
                if d.get('method') == 'Runtime.exceptionThrown':
                    console_errors.append(f"Exception: {d.get('params',{}).get('exceptionDetails')}")
                if d.get('id') == curr:
                    return d.get('result')

        await send('Page.enable')
        await send('Runtime.enable')

        # 1. Test primary index.html
        print("\n--- 1. Testing Primary index.html Load ---")
        await send('Page.navigate', {'url': f'http://127.0.0.1:{p}/index.html'})
        await asyncio.sleep(1.5)
        
        title_res = await send('Runtime.evaluate', {'expression': 'document.title', 'returnByValue': True})
        title = title_res.get('result', {}).get('value', '')
        if 'PDF Tools' in title:
            log_p(f"Primary index.html title verified: '{title}'")
        else:
            log_f(f"Unexpected title: '{title}'")
            
        app_len = await send('Runtime.evaluate', {'expression': 'document.getElementById("app")?.innerHTML.length', 'returnByValue': True})
        if app_len.get('result', {}).get('value', 0) > 1000:
            log_p(f"Svelte 5 modern suite mounted in primary index.html ({app_len.get('result', {}).get('value')} HTML characters)")
        else:
            log_f(f"App mounting failed: {app_len}")

        # 2. Check Classic Link
        classic_link = await send('Runtime.evaluate', {
            'expression': 'document.querySelector("a[href*=\'classic.html\']")?.getAttribute("href")',
            'returnByValue': True
        })
        if classic_link.get('result', {}).get('value') == 'classic.html':
            log_p("Header contains valid link to classic.html for fallback access")
        else:
            log_f(f"Classic link missing or wrong: {classic_link}")

        # 3. Test Navigation across tools
        print("\n--- 2. Testing Hash Navigation on Primary index.html ---")
        for tab in ['merge', 'remove', 'split', 'slides', 'invert', 'compress', 'images', 'pdftoimages']:
            await send('Page.navigate', {'url': f'http://127.0.0.1:{p}/index.html#{tab}'})
            await asyncio.sleep(0.3)
            active_check = await send('Runtime.evaluate', {
                'expression': f'window.location.hash === "#{tab}" && !!document.querySelector("main")',
                'returnByValue': True
            })
            if active_check.get('result', {}).get('value') is True:
                log_p(f"Primary index.html deep-linked to #{tab} successfully")
            else:
                log_f(f"Deep link #{tab} failed")

        # 4. Test In-Browser PDF Merge
        print("\n--- 3. Testing Client-Side PDF Operations on Primary index.html ---")
        pdf_merge_expr = """
        (async () => {
            const script = document.createElement('script');
            script.src = 'assets/vendor/pdf-lib.min.js';
            document.head.appendChild(script);
            await new Promise((res, rej) => { script.onload = res; script.onerror = rej; });
            
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
                byteLength: finalBytes.byteLength,
                isPdf: finalBytes[0] === 0x25 && finalBytes[1] === 0x50 && finalBytes[2] === 0x44 && finalBytes[3] === 0x46
            };
        })()
        """
        merge_res = await send('Runtime.evaluate', {'expression': pdf_merge_expr, 'awaitPromise': True, 'returnByValue': True})
        val = merge_res.get('result', {}).get('value', {})
        if val.get('pageCount') == 2 and val.get('isPdf') is True and val.get('byteLength', 0) > 0:
            log_p(f"In-Browser PDF merge on primary index.html: {val.get('pageCount')} pages, {val.get('byteLength')} bytes")
        else:
            log_f(f"Merge execution failed: {val}")

        # 5. Test Navigation to classic.html
        print("\n--- 4. Testing classic.html Fallback ---")
        await send('Page.navigate', {'url': f'http://127.0.0.1:{p}/classic.html'})
        await asyncio.sleep(1.0)
        classic_h1 = await send('Runtime.evaluate', {'expression': 'document.querySelector("#appMainTitle")?.innerText', 'returnByValue': True})
        if classic_h1.get('result', {}).get('value') == 'PDF Tools':
            log_p("classic.html rendered legacy UI correctly with #appMainTitle")
        else:
            log_f(f"classic.html failed to render: {classic_h1}")

        # 6. Check console errors
        print("\n--- 5. Console Hygiene ---")
        if len(console_errors) == 0:
            log_p("Zero console errors observed during primary index.html test run")
        else:
            for err in console_errors:
                print(f"  [ERROR] {err}")
            log_f(f"Found {len(console_errors)} console errors")

    kill_process_tree(proc)
    s.shutdown()
    shutil.rmtree(tmp, ignore_errors=True)

    print("\n=======================================================")
    print(f"Primary index.html Verification: {passed} passed, {failed} failed")
    print("=======================================================")
    return failed == 0

if __name__ == "__main__":
    success = asyncio.run(test_primary_index())
    sys.exit(0 if success else 1)
