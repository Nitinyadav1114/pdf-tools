import os, re

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def minify_css(css: str) -> str:
    # Ensure space around */ and * to prevent accidental unclosed comments
    css = re.sub(r'\*/\*', '*/ *', css)
    # Remove comments
    css = re.sub(r'/\*[\s\S]*?\*/', '', css)
    # Normalize whitespace
    css = re.sub(r'\s+', ' ', css)
    # Remove space around delimiters
    css = re.sub(r'\s*([\{\}\:;,>~\+])\s*', r'\1', css)
    # Remove trailing semicolons before closing brace
    css = re.sub(r';\}', '}', css)
    return css.strip()

FILES = [
    'assets/css/tailwind.dist.css',
    'assets/css/core/modern-design-system.css',
    'assets/css/core/variables.css',
    'assets/css/core/base.css',
    'assets/css/components/nav.css',
    'assets/css/components/dropzone.css',
    'assets/css/components/cards.css',
    'assets/css/tabs/tab-remove.css',
    'assets/css/tabs/tab-slides.css',
    'assets/css/tabs/tab-invert.css',
    'assets/css/tabs/tab-compress.css',
    'assets/css/tabs/tab-images.css',
    'assets/css/tabs/tab-pdftoimages.css',
    'assets/css/core/responsive.css',
]

def build():
    parts = []

    # Modern Material Symbols containment baseline
    material_symbols_css = """
.material-symbols-outlined {
  font-family: 'Material Symbols Outlined';
  font-weight: normal;
  font-style: normal;
  font-size: 24px;
  line-height: 1;
  letter-spacing: normal;
  text-transform: none;
  display: inline-block;
  white-space: nowrap;
  word-wrap: normal;
  direction: ltr;
  -webkit-font-feature-settings: 'liga';
  -webkit-font-smoothing: antialiased;
  width: 1em;
  height: 1em;
  overflow: hidden;
  vertical-align: middle;
  font-display: block;
}
"""
    parts.append(material_symbols_css)

    for rel_path in FILES:
        abs_path = os.path.join(REPO_ROOT, rel_path)
        if os.path.exists(abs_path):
            with open(abs_path, "r", encoding="utf-8") as f:
                parts.append(f.read())
        else:
            print(f"Warning: {abs_path} not found!")

    combined = "\n".join(parts)
    minified = minify_css(combined)

    out_dir = os.path.join(REPO_ROOT, "assets", "css")
    os.makedirs(out_dir, exist_ok=True)
    out_file = os.path.join(out_dir, "bundle.min.css")
    with open(out_file, "w", encoding="utf-8") as f:
        f.write(minified)

    print(f"Original total size: {len(combined)} bytes")
    print(f"Minified bundle size: {len(minified)} bytes (saved {len(combined) - len(minified)} bytes)")

if __name__ == '__main__':
    build()
