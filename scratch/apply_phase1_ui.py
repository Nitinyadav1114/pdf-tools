import re, os

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INDEX_PATH = os.path.join(REPO_ROOT, 'index.html')

with open(INDEX_PATH, 'r', encoding='utf-8') as f:
    html = f.read()

# Load generated Lucide sprite
with open(os.path.join(REPO_ROOT, 'scratch', 'lucide_sprite.html'), 'r', encoding='utf-8') as f:
    sprite_xml = f.read()

ambient_orbs_html = """
  <!-- Ambient Atmospheric Glow Orbs (Subtle Depth & Rich SaaS Texture) -->
  <div class="ambient-glow-wrapper" aria-hidden="true">
    <div class="ambient-orb ambient-orb-1"></div>
    <div class="ambient-orb ambient-orb-2"></div>
    <div class="ambient-orb ambient-orb-3"></div>
  </div>
"""

# 1. Insert sprite and ambient orbs right after <body class="theme-light">
body_tag = '<body class="theme-light">'
if 'id="lucideSprite"' not in html:
    # Give the sprite an id
    sprite_with_id = sprite_xml.replace('<svg xmlns="http://www.w3.org/2000/svg" style="display: none;"', '<svg id="lucideSprite" xmlns="http://www.w3.org/2000/svg" style="display: none;"')
    replacement = f'{body_tag}\n  {sprite_with_id}\n{ambient_orbs_html}'
    html = html.replace(body_tag, replacement, 1)
    print("[+] Injected Lucide sprite and ambient atmospheric glow orbs.")

# 2. Update Header Privacy Badge
old_header_lock = '<span class="material-symbols-outlined text-[15px]" style="font-variation-settings: \'FILL\' 1;">lock</span>'
new_header_lock = '<svg class="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" aria-hidden="true"><use href="#lucide-lock"></use></svg>'
if old_header_lock in html:
    html = html.replace(old_header_lock, new_header_lock)
    print("[+] Updated Header Privacy Badge lock icon.")

# 3. Update Header Install Button
old_header_install = '<span class="material-symbols-outlined text-[16px]">download_for_offline</span>'
new_header_install = '<svg class="w-4 h-4 shrink-0" aria-hidden="true"><use href="#lucide-download"></use></svg>'
if old_header_install in html:
    html = html.replace(old_header_install, new_header_install)
    print("[+] Updated Header Install Button icon.")

# 4. Update Header Theme Toggle Emojis to Crisp Lucide SVGs
old_theme_icons = """<span class="theme-icon light-icon">🌙</span>
          <span class="theme-icon dark-icon hidden">☀️</span>"""
new_theme_icons = """<svg class="theme-icon light-icon w-4 h-4 shrink-0 text-slate-700" aria-hidden="true"><use href="#lucide-moon"></use></svg>
          <svg class="theme-icon dark-icon hidden w-4 h-4 shrink-0 text-amber-400" aria-hidden="true"><use href="#lucide-sun"></use></svg>"""
if old_theme_icons in html:
    html = html.replace(old_theme_icons, new_theme_icons)
    print("[+] Updated Theme Toggle icons to Lucide vector sun/moon.")

# 5. Update Nav Tabs
nav_replacements = [
    ('<button class="nav-tab active" id="tabHomeBtn" data-tab="home">\n          <span class="material-symbols-outlined text-[16px]">grid_view</span>',
     '<button class="nav-tab active" id="tabHomeBtn" data-tab="home">\n          <svg class="w-4 h-4 shrink-0" aria-hidden="true"><use href="#lucide-grid"></use></svg>'),
    ('<button class="nav-tab" id="tabMergeBtn" data-tab="merge">\n          <span class="material-symbols-outlined text-[16px]">merge</span>',
     '<button class="nav-tab" id="tabMergeBtn" data-tab="merge">\n          <svg class="w-4 h-4 shrink-0" aria-hidden="true"><use href="#lucide-merge"></use></svg>'),
    ('<button class="nav-tab" id="tabRemoveBtn" data-tab="remove">\n          <span class="material-symbols-outlined text-[16px]">content_cut</span>',
     '<button class="nav-tab" id="tabRemoveBtn" data-tab="remove">\n          <svg class="w-4 h-4 shrink-0" aria-hidden="true"><use href="#lucide-scissors"></use></svg>'),
    ('<button class="nav-tab" id="tabSlidesBtn" data-tab="slides">\n          <span class="material-symbols-outlined text-[16px]">view_agenda</span>',
     '<button class="nav-tab" id="tabSlidesBtn" data-tab="slides">\n          <svg class="w-4 h-4 shrink-0" aria-hidden="true"><use href="#lucide-layers"></use></svg>'),
    ('<button class="nav-tab" id="tabInvertBtn" data-tab="invert">\n          <span class="material-symbols-outlined text-[16px]">invert_colors</span>',
     '<button class="nav-tab" id="tabInvertBtn" data-tab="invert">\n          <svg class="w-4 h-4 shrink-0" aria-hidden="true"><use href="#lucide-sun-moon"></use></svg>'),
    ('<button class="nav-tab" id="tabCompressBtn" data-tab="compress">\n          <span class="material-symbols-outlined text-[16px]">compress</span>',
     '<button class="nav-tab" id="tabCompressBtn" data-tab="compress">\n          <svg class="w-4 h-4 shrink-0" aria-hidden="true"><use href="#lucide-minimize-2"></use></svg>'),
    ('<button class="nav-tab" id="tabImagesBtn" data-tab="images">\n          <span class="material-symbols-outlined text-[16px]">image</span>',
     '<button class="nav-tab" id="tabImagesBtn" data-tab="images">\n          <svg class="w-4 h-4 shrink-0" aria-hidden="true"><use href="#lucide-images"></use></svg>'),
    ('<button class="nav-tab" id="tabPdfToImagesBtn" data-tab="pdftoimages">\n          <span class="material-symbols-outlined text-[16px]">photo_library</span>',
     '<button class="nav-tab" id="tabPdfToImagesBtn" data-tab="pdftoimages">\n          <svg class="w-4 h-4 shrink-0" aria-hidden="true"><use href="#lucide-file-image"></use></svg>'),
    ('<button class="nav-tab" id="tabSplitBtn" data-tab="split">\n          <span class="material-symbols-outlined text-[16px]">call_split</span>',
     '<button class="nav-tab" id="tabSplitBtn" data-tab="split">\n          <svg class="w-4 h-4 shrink-0" aria-hidden="true"><use href="#lucide-split"></use></svg>')
]
for old, new in nav_replacements:
    if old in html:
        html = html.replace(old, new)
        print(f"[+] Replaced nav tab icon: {old.split('data-tab=')[1].split('>')[0]}")

# 6. Update Landing Page Hero Badge & Dropzone
old_hero_badge = """<div class="home-hero-badge">
            <span class="material-symbols-outlined text-[15px]">verified_user</span>"""
new_hero_badge = """<div class="home-hero-badge">
            <svg class="w-4 h-4 text-emerald-500 shrink-0" aria-hidden="true"><use href="#lucide-shield-check"></use></svg>"""
if old_hero_badge in html:
    html = html.replace(old_hero_badge, new_hero_badge)
    print("[+] Replaced Home Hero Badge icon.")

old_drop_icon = """<div class="dropzone-icon-box" style="color: var(--tool-home);">
                <span class="material-symbols-outlined text-[32px]">auto_awesome</span>
              </div>"""
new_drop_icon = """<div class="dropzone-icon-box" style="color: var(--tool-home);">
                <svg class="w-8 h-8 shrink-0" aria-hidden="true"><use href="#lucide-upload-cloud"></use></svg>
              </div>"""
if old_drop_icon in html:
    html = html.replace(old_drop_icon, new_drop_icon)
    print("[+] Replaced Home Dropzone upload icon.")

# 7. Update 8 Tool Cards
tool_card_replacements = [
    ('<span class="material-symbols-outlined text-[24px]">merge</span>',
     '<svg class="w-6 h-6 shrink-0" aria-hidden="true"><use href="#lucide-merge"></use></svg>'),
    ('<span class="material-symbols-outlined text-[24px]">call_split</span>',
     '<svg class="w-6 h-6 shrink-0" aria-hidden="true"><use href="#lucide-split"></use></svg>'),
    ('<span class="material-symbols-outlined text-[24px]">content_cut</span>',
     '<svg class="w-6 h-6 shrink-0" aria-hidden="true"><use href="#lucide-scissors"></use></svg>'),
    ('<span class="material-symbols-outlined text-[24px]">view_agenda</span>',
     '<svg class="w-6 h-6 shrink-0" aria-hidden="true"><use href="#lucide-layers"></use></svg>'),
    ('<span class="material-symbols-outlined text-[24px]">contrast</span>',
     '<svg class="w-6 h-6 shrink-0" aria-hidden="true"><use href="#lucide-sun-moon"></use></svg>'),
    ('<span class="material-symbols-outlined text-[24px]">compress</span>',
     '<svg class="w-6 h-6 shrink-0" aria-hidden="true"><use href="#lucide-minimize-2"></use></svg>'),
    ('<span class="material-symbols-outlined text-[24px]">image</span>',
     '<svg class="w-6 h-6 shrink-0" aria-hidden="true"><use href="#lucide-images"></use></svg>'),
    ('<span class="material-symbols-outlined text-[24px]">photo_library</span>',
     '<svg class="w-6 h-6 shrink-0" aria-hidden="true"><use href="#lucide-file-image"></use></svg>')
]
for old, new in tool_card_replacements:
    if old in html:
        html = html.replace(old, new, 1)
        print("[+] Replaced tool card main icon.")

# Replace all CTA arrow_forwards on tool cards
old_cta = """<div class="home-tool-cta">
                <span>Launch Tool</span>
                <span class="material-symbols-outlined text-[16px]">arrow_forward</span>
              </div>"""
new_cta = """<div class="home-tool-cta">
                <span>Launch Tool</span>
                <svg class="w-4 h-4 shrink-0 transition-transform" aria-hidden="true"><use href="#lucide-arrow-right"></use></svg>
              </div>"""
if old_cta in html:
    html = html.replace(old_cta, new_cta)
    print("[+] Replaced all Tool Card CTA arrow_forward icons.")

# 8. Update Security Architecture Section Cards
sec_replacements = [
    ('<div class="home-security-icon-box">\n                <span class="material-symbols-outlined text-[24px]">verified_user</span>',
     '<div class="home-security-icon-box">\n                <svg class="w-6 h-6 shrink-0" aria-hidden="true"><use href="#lucide-shield-check"></use></svg>'),
    ('<div class="home-security-icon-box">\n                <span class="material-symbols-outlined text-[24px]">bolt</span>',
     '<div class="home-security-icon-box">\n                <svg class="w-6 h-6 shrink-0" aria-hidden="true"><use href="#lucide-zap"></use></svg>'),
    ('<div class="home-security-icon-box">\n                <span class="material-symbols-outlined text-[24px]">devices</span>',
     '<div class="home-security-icon-box">\n                <svg class="w-6 h-6 shrink-0" aria-hidden="true"><use href="#lucide-devices"></use></svg>')
]
for old, new in sec_replacements:
    if old in html:
        html = html.replace(old, new)
        print("[+] Replaced security section icon.")

# 9. Update Footer Impact Counter & Guarantee Badge
footer_replacements = [
    ('<div class="w-12 h-12 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0 shadow-sm border border-indigo-100 dark:border-indigo-900/40">\n              <span class="material-symbols-outlined text-[26px]">groups</span>',
     '<div class="w-12 h-12 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0 shadow-sm border border-indigo-100 dark:border-indigo-900/40">\n              <svg class="w-6 h-6 shrink-0" aria-hidden="true"><use href="#lucide-users"></use></svg>'),
    ('<div class="w-12 h-12 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 shadow-sm border border-emerald-100 dark:border-emerald-900/40">\n              <span class="material-symbols-outlined text-[26px]">enhanced_encryption</span>',
     '<div class="w-12 h-12 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 shadow-sm border border-emerald-100 dark:border-emerald-900/40">\n              <svg class="w-6 h-6 shrink-0" aria-hidden="true"><use href="#lucide-shield-check"></use></svg>'),
    ('<span class="material-symbols-outlined text-[16px] text-amber-500" style="font-variation-settings: \'FILL\' 1;">bolt</span>',
     '<svg class="w-4 h-4 text-amber-500 shrink-0" aria-hidden="true"><use href="#lucide-zap"></use></svg>'),
    ('<div class="privacy-badge">\n          <span class="material-symbols-outlined text-[16px]">verified_user</span>',
     '<div class="privacy-badge">\n          <svg class="w-4 h-4 shrink-0" aria-hidden="true"><use href="#lucide-shield-check"></use></svg>')
]
for old, new in footer_replacements:
    if old in html:
        html = html.replace(old, new)
        print("[+] Replaced footer counter / badge icon.")

# 10. Update Universal Share Modal Icons
share_replacements = [
    ('<span class="material-symbols-outlined text-[22px]">share</span>',
     '<svg class="w-5 h-5 shrink-0" aria-hidden="true"><use href="#lucide-share-2"></use></svg>'),
    ('<button type="button" id="closeShareModalBtn" class="text-slate-muted dark:text-slate-400 hover:text-on-surface dark:hover:text-white p-1 rounded-lg transition-colors" aria-label="Close dialog">\n          <span class="material-symbols-outlined text-[20px]">close</span>',
     '<button type="button" id="closeShareModalBtn" class="text-slate-muted dark:text-slate-400 hover:text-on-surface dark:hover:text-white p-1 rounded-lg transition-colors" aria-label="Close dialog">\n          <svg class="w-5 h-5 shrink-0" aria-hidden="true"><use href="#lucide-x"></use></svg>'),
    ('<span class="material-symbols-outlined text-[18px]">download</span>\n            <span>Save / Download to Device</span>',
     '<svg class="w-4 h-4 shrink-0" aria-hidden="true"><use href="#lucide-download"></use></svg>\n            <span>Save / Download to Device</span>'),
    ('<span class="material-symbols-outlined text-[18px] text-indigo-500">content_copy</span>\n            <span>Copy App Link</span>',
     '<svg class="w-4 h-4 text-indigo-500 shrink-0" aria-hidden="true"><use href="#lucide-copy"></use></svg>\n            <span>Copy App Link</span>'),
    ('<span class="text-lg mb-0.5">💬</span>\n            <span class="text-[11px]">WhatsApp</span>',
     '<svg class="w-5 h-5 mb-1 shrink-0" aria-hidden="true"><use href="#lucide-whatsapp"></use></svg>\n            <span class="text-[11px]">WhatsApp</span>'),
    ('<span class="text-lg mb-0.5">✉️</span>\n            <span class="text-[11px]">Email</span>',
     '<svg class="w-5 h-5 mb-1 shrink-0" aria-hidden="true"><use href="#lucide-mail"></use></svg>\n            <span class="text-[11px]">Email</span>'),
    ('<span class="text-lg mb-0.5">✈️</span>\n            <span class="text-[11px]">Telegram</span>',
     '<svg class="w-5 h-5 mb-1 shrink-0" aria-hidden="true"><use href="#lucide-send"></use></svg>\n            <span class="text-[11px]">Telegram</span>'),
    ('<span class="material-symbols-outlined text-[14px] text-emerald-500">lock</span>\n        <span>100% Private: Files never leave your browser</span>',
     '<svg class="w-3.5 h-3.5 text-emerald-500 shrink-0" aria-hidden="true"><use href="#lucide-lock"></use></svg>\n        <span>100% Private: Files never leave your browser</span>')
]
for old, new in share_replacements:
    if old in html:
        html = html.replace(old, new)
        print("[+] Replaced share modal icon.")

with open(INDEX_PATH, 'w', encoding='utf-8') as f:
    f.write(html)

print("[SUCCESS] Applied Phase 1 UI enhancements to index.html!")
