import re

html = open('index.html', encoding='utf-8').read()

tabs = ['merge', 'remove', 'slides', 'invert', 'compress', 'images', 'pdftoimages']

print("=== TAB BUTTONS ===")
for t in tabs:
    btn_match = re.search(r'data-tab=[\'"]' + t + r'[\'"]', html)
    print(f'Tab button [{t}]: {bool(btn_match)}')

print("\n=== TAB VIEWS ===")
view_ids = ['mergeTabView', 'removeTabView', 'slidesTabView', 'invertTabView', 'compressTabView', 'imagesTabView', 'pdfToImagesTabView']
for v in view_ids:
    view_match = re.search(r'id=[\'"]' + v + r'[\'"]', html)
    print(f'View [{v}]: {bool(view_match)}')

print("\n=== DROPZONES ===")
dropzone_ids = ['dropzone', 'removeDropzone', 'slidesDropzone', 'invertDropzone', 'compressDropzone', 'imagesDropzone', 'pdfToImagesDropzone']
for dz in dropzone_ids:
    dz_match = re.search(r'id=[\'"]' + dz + r'[\'"]', html)
    print(f'Dropzone [{dz}]: {bool(dz_match)}')

print("\n=== CTAs ===")
cta_ids = ['mergeBtn', 'executeRemoveBtn', 'executeSlidesBtn', 'executeInvertBtn', 'executeCompressBtn', 'executeImagesBtn', 'pdfToImagesExecuteBtn']
for cta in cta_ids:
    cta_match = re.search(r'id=[\'"]' + cta + r'[\'"]', html)
    print(f'CTA [{cta}]: {bool(cta_match)}')

print("\n=== FLOATING ORBS IN DROPZONES ===")
for dz in dropzone_ids:
    idx = html.find(f'id="{dz}"')
    if idx != -1:
        snippet = html[idx:idx+1000]
        has_orb = 'blur-3xl' in snippet
        print(f'Orb in [{dz}]: {has_orb}')

print("\n=== ACTIVE PILL INDICATORS IN CSS ===")
bundle = open('assets/css/bundle.min.css', encoding='utf-8').read()
for t in tabs:
    has_light = f'nav-tab[data-tab="{t}"].active' in bundle
    print(f'Tab [{t}] active pill styling in bundle: {has_light}')
