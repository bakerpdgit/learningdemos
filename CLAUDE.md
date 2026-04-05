# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

A collection of standalone, self-contained interactive learning demos for A-level Maths and AQA Computer Science. Each demo is a single `.html` file with all CSS and JavaScript inlined — no build step, no dependencies to install, no framework.

The site is hosted as a static site (GitHub Pages via `CNAME`). `index.html` is the landing page that links to all demos as tiles.

## Running locally

Open any `.html` file directly in a browser, or use VS Code's Live Server extension (pre-configured on port 5501 in `.vscode/settings.json`):

```
# With Live Server extension in VS Code: click "Go Live" in the status bar
# Or open any .html file directly in a browser
```

## Architecture

- **No build tooling.** Every page is a single `.html` file. Styles and scripts are inlined; no external local files are referenced between pages.
- **External CDNs only.** Some demos use CDN-hosted libraries:
  - Tailwind CSS (`cdn.tailwindcss.com`) — used in some quiz pages
  - KaTeX (`cdn.jsdelivr.net/npm/katex`) — used for maths rendering
  - Lucide icons (`unpkg.com/lucide`) — used in some pages
- **No shared components.** Each file is independent. Common patterns (CSS variables for theming, responsive layout via CSS Grid/Flexbox, `<canvas>` for physics simulations) are copy-pasted between files rather than shared.
- **Two broad demo types:**
  1. **Physics simulations** — use `<canvas>` with `requestAnimationFrame` loops (e.g. `forces.html`, `atwood_machine.html`, `vertical_circular_motion.html`)
  2. **CS/Maths interactive tools** — DOM-based UIs with quiz logic, step-through simulators, or practice environments (e.g. `aqa_assembly_challenges.html`, `sql_practice.html`, `boolean_algebra_quiz.html`)

## Adding a new demo

1. Create a new `.html` file at the repo root with all CSS and JS inlined.
2. Add a tile link in `index.html` inside the `<div class="grid">` block.
3. Follow the established CSS variable pattern (`:root { --bg, --panel, --accent, ... }`) for theming consistency.
