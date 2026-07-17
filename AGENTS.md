# AGENTS.md

This file provides guidance to AI agents working in this repository.

## What this repo is

This is a collection of interactive learning demos for A-level Maths and AQA Computer Science. Source demos remain root-level HTML files so they are easy to author and preview, while the public site is generated into `dist/` by the build.

`index.html` is the landing-page source. GitHub Pages must publish the generated `dist/` artifact, not the repository root.

## Source and production are deliberately different

- Root `*.html` files are authoring sources. A demo may use `type="text/babel"`, the Tailwind browser CDN and other CDN libraries while it is being developed.
- Every demo source (everything except `index.html` and `about.html`) loads `scripts/site-shell.js`. In a source preview, this supplies the standard interactive title row and its theme button. It does not add the site navigation row.
- No source page contains the CS Learning/Home site navigation. `npm run build` writes the production site to `dist/`, compiles JSX, generates static Tailwind styles, removes runtime Babel/Tailwind compilers, and injects that common navigation once.
- `dist/` is generated and ignored by Git. Never edit it directly.

## Running locally

Install and validate everything after cloning or changing dependencies:

```sh
npm ci
npm test
```

Serve the built site at `http://127.0.0.1:5501/index.html`:

```sh
npm run dev
```

In VS Code, run **Build, serve and debug site** or press F5. The pre-launch task runs the full build/check suite, the server uses port 5502, and Edge opens against `dist/`.

Opening a root HTML file directly is still useful for quick source work, but production checks must use the built `dist/` version.

## Site and interactive headers

There are two separate rows in a built demo:

1. The dark site navigation row is owned by `scripts/build-runtime-js.js` and is injected only during the build. It contains the CS Learning brand and Home link. It must not contain a theme toggle.
2. The full-width interactive row is part of source testing through `scripts/site-shell.js`. Its title is on the left. Optional filters/actions and the automatically supplied theme toggle are on the right, with the theme toggle last.

For new or substantially edited demos, mark the authored interactive row explicitly:

```html
<header data-interactive-header>
  <h1>Interactive title</h1>
  <div data-interactive-actions>
    <!-- Optional topic/filter controls; the shared theme button is appended here. -->
  </div>
</header>
```

Do not add a copied CS Learning/Home site header to a demo. `scripts/check-site-shell.js` rejects copied site navigation in source. The shared shell currently provides three hidden legacy theme IDs (`theme-toggle`, `icon-sun`, and `icon-moon`) so older lesson scripts can finish startup without retaining the old header markup.

## Architecture

- `scripts/build-runtime-js.js` is the production compiler and site assembler.
- `scripts/site-shell.js` and `scripts/site-shell.css` are the shared interactive-shell behavior and styling used by source previews and built pages.
- `scripts/check-no-runtime-babel.js` rejects production runtime compilers and missing generated Tailwind assets.
- `scripts/check-site-shell.js` checks the site/interactive header contract on every page.
- `scripts/serve.js` serves only `dist/` and deliberately disables caching.
- `.github/workflows/pages.yml` runs `npm ci`, `npm test`, uploads `dist/`, and deploys it through GitHub Pages.
- React, ReactDOM, KaTeX and Lucide may still be loaded as ordinary runtime libraries where a demo needs them. Babel and the Tailwind browser compiler are source-only tools.
- Demos otherwise remain independent: their lesson UI, CSS and interaction logic stay in their own HTML source.

## Adding a new demo

1. Create a root-level `.html` source file.
2. Include `<script src="scripts/site-shell.js"></script>` at the end of its `<head>`.
3. Add one `data-interactive-header` row using the contract above. Do not author the site navigation header or a second theme button.
4. Keep the lesson's CSS and JavaScript in the page. Source-only Babel/Tailwind CDN usage is allowed.
5. Add the demo link to the appropriate section of `index.html`.
6. Run `npm test`, then use the VS Code launch configuration or `npm run dev` to check the built page.

## GitHub Pages setup

The workflow deploys on pushes to `main`. In the repository, set **Settings → Pages → Build and deployment → Source** to **GitHub Actions**. The existing custom domain remains configured in Pages settings, and the build copies `CNAME` into `dist/`.
