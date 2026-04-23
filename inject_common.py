#!/usr/bin/env python3
"""
inject_common.py
Batch-injects common head elements into all demo HTML files:
  1. Google Analytics script block (after <title>)
  2. FOUC-prevention dark-mode script
  3. Tailwind dark-mode class config (for pages already using Tailwind)
  4. Removes legacy global-home-link <style> block
  5. Removes legacy global-home-link <a> tag from <body>

Skips: index.html, about.html, dijkstra.html, archive/
"""

import os, re, sys

SKIP = {"index.html", "about.html", "dijkstra.html"}
BASE = os.path.dirname(os.path.abspath(__file__))

GA_BLOCK = """\
    <!-- Google tag (gtag.js) -->
    <script
      async
      src="https://www.googletagmanager.com/gtag/js?id=G-DYQESQXT38"
    ></script>
    <script>
      window.dataLayer = window.dataLayer || [];
      function gtag() { dataLayer.push(arguments); }
      gtag("js", new Date());
      gtag("config", "G-DYQESQXT38");
    </script>"""

FOUC_BLOCK = """\
    <!-- Prevent FOUC: apply dark class before render -->
    <script>
      (function () {
        try {
          var mode = localStorage.getItem("uimode");
          if (
            mode === "dark" ||
            (!mode && window.matchMedia("(prefers-color-scheme: dark)").matches)
          ) {
            document.documentElement.classList.add("dark");
          }
        } catch (e) {}
      })();
    </script>"""

TAILWIND_DARK_CONFIG = """\
    <script>
      tailwind.config = {
        darkMode: "class",
        theme: {
          extend: {
            colors: {
              headerBg: "#0f172a",
              headerAccent: "#38bdf8",
            },
          },
        },
      };
    </script>"""

def process(path):
    with open(path, "r", encoding="utf-8") as f:
        html = f.read()

    changed = False

    # 1. Inject GA after </title> if not present
    if "G-DYQESQXT38" not in html:
        # find </title>
        m = re.search(r"(</title>)", html, re.IGNORECASE)
        if m:
            html = html[:m.end()] + "\n" + GA_BLOCK + html[m.end():]
            changed = True
            print(f"  [GA] injected")

    # 2. Inject FOUC script (before </head>) if not present
    if "localStorage.getItem('uimode')" not in html and 'localStorage.getItem("uimode")' not in html:
        m = re.search(r"(</head>)", html, re.IGNORECASE)
        if m:
            html = html[:m.start()] + FOUC_BLOCK + "\n" + html[m.start():]
            changed = True
            print(f"  [FOUC] injected")

    # 3. Add Tailwind dark mode config if Tailwind present but dark config missing
    has_tailwind = "cdn.tailwindcss.com" in html
    has_dark_config = 'darkMode: "class"' in html or "darkMode: 'class'" in html
    if has_tailwind and not has_dark_config:
        # inject after the tailwind script tag
        m = re.search(r'(<script[^>]*cdn\.tailwindcss\.com[^>]*></script>)', html)
        if m:
            html = html[:m.end()] + "\n" + TAILWIND_DARK_CONFIG + html[m.end():]
            changed = True
            print(f"  [Tailwind dark config] injected")

    # 4. Remove the legacy global-home-link <style> block
    if 'id="global-home-link-style"' in html:
        # Remove the whole <style id="global-home-link-style">...</style> block
        html = re.sub(
            r'\s*<style\s+id="global-home-link-style"[^>]*>.*?</style>',
            '',
            html,
            flags=re.DOTALL
        )
        changed = True
        print(f"  [global-home-link style] removed")

    # Also remove inline global-home-link style in aqa_floating_point style
    if '.home-link' in html and 'home-link' in html and 'global-home-link' not in html:
        # will handle per-file
        pass

    # 5. Remove legacy global-home-link <a> tag from body
    if 'class="global-home-link"' in html:
        html = re.sub(
            r'\s*<a\s+class="global-home-link"[^>]*>.*?</a\s*>',
            '',
            html,
            flags=re.DOTALL
        )
        changed = True
        print(f"  [global-home-link anchor] removed")

    if changed:
        with open(path, "w", encoding="utf-8") as f:
            f.write(html)
        return True
    return False

def main():
    updated = []
    skipped = []
    for fname in sorted(os.listdir(BASE)):
        if not fname.endswith(".html"):
            continue
        if fname in SKIP:
            skipped.append(fname)
            continue
        path = os.path.join(BASE, fname)
        if not os.path.isfile(path):
            continue
        print(f"Processing: {fname}")
        if process(path):
            updated.append(fname)
        else:
            print(f"  (no changes needed)")

    print(f"\nDone. Updated {len(updated)} files, skipped {len(skipped)}.")
    for f in updated:
        print(f"  ✓ {f}")

if __name__ == "__main__":
    main()
