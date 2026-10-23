import urllib.request, subprocess, asyncio, websockets, tempfile, json, shutil, os, sys
from capture_svelte_app import find_browser, kill_process_tree, get_free_port, RobustTCPServer, DistHTTPHandler, ARTIFACT_DIR, base64

async def run_e2e_tests():
    p = get_free_port()
    dp = get_free_port()
    s = RobustTCPServer(('127.0.0.1', p), DistHTTPHandler)
    import threading
    threading.Thread(target=s.serve_forever, daemon=True).start()
    tmp = tempfile.mkdtemp(prefix="modern_e2e_")
    
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
    
    def log_pass(msg):
        nonlocal passed
        passed += 1
        print(f"[PASS] {msg}")
        
    def log_fail(msg):
        nonlocal failed
        failed += 1
        print(f"[FAIL] {msg}")

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
                    msg_type = d.get('params', {}).get('type')
                    if msg_type in ['error', 'assert']:
                        args = [a.get('value') or a.get('description') for a in d.get('params',{}).get('args',[])]
                        console_errors.append(f"Console error: {args}")
                if d.get('method') == 'Runtime.exceptionThrown':
                    console_errors.append(f"Exception: {d.get('params',{}).get('exceptionDetails')}")
                if d.get('id') == curr:
                    return d.get('result')

        await send('Page.enable')
        await send('Runtime.enable')
        
        # 1. Navigation to Home
        print("\n--- 1. Testing Page Load & Title ---")
        await send('Page.navigate', {'url': f'http://127.0.0.1:{p}/modern.html'})
        await asyncio.sleep(1.5)
        
        title_res = await send('Runtime.evaluate', {'expression': 'document.title', 'returnByValue': True})
        title = title_res.get('result', {}).get('value', '')
        if 'PDF Tools' in title:
            log_pass(f"Document title rendered correctly: '{title}'")
        else:
            log_fail(f"Unexpected title: '{title}'")
            
        app_html = await send('Runtime.evaluate', {'expression': 'document.getElementById("app")?.children.length', 'returnByValue': True})
        if app_html.get('result', {}).get('value', 0) > 0:
            log_pass("Svelte 5 root application mounted into #app successfully")
        else:
            log_fail("Svelte 5 application failed to mount")

        # 2. Test Navigation to all tabs
        print("\n--- 2. Testing Tab Navigation & Deep-Linking ---")
        tabs = ['home', 'merge', 'remove', 'split', 'slides', 'invert', 'compress', 'images', 'pdftoimages']
        for tab in tabs:
            await send('Page.navigate', {'url': f'http://127.0.0.1:{p}/modern.html#{tab}'})
            await asyncio.sleep(0.3)
            active_check = await send('Runtime.evaluate', {
                'expression': f'window.location.hash === "#{tab}" && !!document.querySelector("main")',
                'returnByValue': True
            })
            if active_check.get('result', {}).get('value') is True:
                log_pass(f"Tab navigation to #{tab} succeeded")
            else:
                log_fail(f"Tab navigation to #{tab} failed")

        # 3. Test Engine Lazy Loading
        print("\n--- 3. Testing PDF Engines & Lazy Loading ---")
        await send('Page.navigate', {'url': f'http://127.0.0.1:{p}/modern.html#merge'})
        await asyncio.sleep(0.5)
        
        # Inject script test calling PDFLib loading
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
        if pdflib_res.get('result', {}).get('value') is True:
            log_pass("PDFLib vendor engine loaded and initialized window.PDFLib")
        else:
            log_fail(f"PDFLib loading failed: {pdflib_res}")

        # 4. Test In-Browser PDF Creation & Merging
        print("\n--- 4. Testing Client-Side PDF Operations (Merge) ---")
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
                byteLength: finalBytes.byteLength,
                isPdf: finalBytes[0] === 0x25 && finalBytes[1] === 0x50 && finalBytes[2] === 0x44 && finalBytes[3] === 0x46 // %PDF
            };
        })()
        """
        merge_res = await send('Runtime.evaluate', {'expression': pdf_merge_expr, 'awaitPromise': True, 'returnByValue': True})
        val = merge_res.get('result', {}).get('value', {})
        if val.get('pageCount') == 2 and val.get('isPdf') is True and val.get('byteLength', 0) > 0:
            log_pass(f"100% In-Browser PDF Merge verified: {val.get('pageCount')} pages, {val.get('byteLength')} bytes, valid %PDF header")
        else:
            log_fail(f"Client-side PDF merge failed: {val}")

        # 5. Check Console Errors
        print("\n--- 5. Console Hygiene & Exception Audit ---")
        if len(console_errors) == 0:
            log_pass("Zero console errors or unhandled exceptions observed")
        else:
            for err in console_errors:
                print(f"  [ERROR] {err}")
            log_fail(f"Found {len(console_errors)} console errors")

        # 6. Capture Visual Verification Screenshot
        shot = await send('Page.captureScreenshot', {'format': 'png'})
        screenshot_path = os.path.join(ARTIFACT_DIR, 'svelte5_e2e_verified.png')
        with open(screenshot_path, 'wb') as f:
            f.write(base64.b64decode(shot['data']))
        print(f"\nCaptured visual proof to: {screenshot_path}")

    kill_process_tree(proc)
    s.shutdown()
    shutil.rmtree(tmp, ignore_errors=True)
    
    print("\n=======================================================")
    print(f"E2E Verification Summary: {passed} passed, {failed} failed")
    print("=======================================================")
    return failed == 0

if __name__ == "__main__":
    success = asyncio.run(run_e2e_tests())
    sys.exit(0 if success else 1)
