import re

html = open("index.html", encoding="utf-8").read()
dom = open("assets/js/core/dom.js", encoding="utf-8").read()

ids = re.findall(r":\s*'([^']+)'", dom)
missing = [i for i in ids if f'id="{i}"' not in html]

print(f"Total DOM IDs: {len(ids)}, Missing: {len(missing)}")
if missing:
    print("Missing IDs:", missing)
else:
    print("ALL DOM IDs are 100% intact!")
