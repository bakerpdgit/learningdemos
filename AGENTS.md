# AGENTS.md

This is the canonical contributor and design contract for this repository. Read it before changing a page, shared shell, build script, or deployment workflow.

## Purpose and content model

This repository contains interactive learning resources for AQA A-level Computer Science, with additional A-level Maths and Science activities. The public site is static, but many source pages contain React, JSX, Tailwind utility classes, canvas simulations, or substantial inline JavaScript.

Each root-level `.html` file remains the authoring source for one independent activity. Lesson-specific markup, styles, data, and interaction logic normally stay in that file. `index.html` is the landing-page source and `about.html` is the site information page.

The repository deliberately has a build step. GitHub Pages publishes `dist/`; it must never publish the repository root.

## Source files versus production files

Root HTML and production HTML are intentionally different:

- Root `*.html` files are editable sources. React pages may use `type="text/babel"` and the Babel standalone script in source. Tailwind pages may use `cdn.tailwindcss.com` and an inline `tailwind.config` object in source.
- `npm run build` recreates `dist/` from scratch. It compiles JSX to ordinary browser JavaScript, generates static Tailwind CSS, removes the Babel and Tailwind browser compilers, copies shared assets and `CNAME`, writes `.nojekyll`, and injects the production site navigation.
- Production may still load normal runtime libraries such as React, ReactDOM, KaTeX, Lucide, or Chart.js when a page needs them. “No runtime compiler” means no Babel standalone and no Tailwind browser compiler in `dist/`.
- `dist/` and `node_modules/` are generated and ignored by Git. Never edit or commit generated files.
- A root source preview is useful while authoring, but only the built preview represents production accurately.

Do not “fix” source-only Babel or Tailwind references by hand unless changing the build architecture. The production checks enforce their removal from `dist/`.

## Build, test, preview, and deployment

Install dependencies from the lockfile:

```sh
npm ci
```

Build and run every validation:

```sh
npm test
```

Build once and serve `dist/` without caching:

```sh
npm run dev
```

The default server URL is `http://127.0.0.1:5501/index.html`.

The checked-in VS Code configuration is under `.vscode/`. Run **Build, serve and debug site** or press F5. Its pre-launch task runs `npm test`, serves `dist/` on port 5502, and launches Edge with `dist/` as the web root.

GitHub Pages deployment is defined in `.github/workflows/pages.yml`. Pushes to `main` and manual workflow dispatches run `npm ci`, `npm test`, upload `dist/`, and deploy that artifact. Repository **Settings → Pages → Build and deployment → Source** must be **GitHub Actions**, not “Deploy from a branch”. The custom domain is configured in Pages settings and the build copies `CNAME` into the artifact.

## Shared site structure

A built interactive has two horizontal bars:

1. The 58px dark navy site-navigation bar is injected by `scripts/build-runtime-js.js`. It owns the **<CS> Learning** brand and **Home** link.
2. The indigo interactive title bar is normalized by `scripts/site-shell.js` and `scripts/site-shell.css`. It owns the activity title and optional subtitle on the left, with activity controls on the right.

There must be only one of each bar. Source pages must not copy the site-navigation bar; the build adds it once. The site-navigation bar never contains a theme toggle. The interactive bar contains the theme toggle as its final control.

For new or substantially revised pages, prefer explicit source markup:

```html
<header data-interactive-header>
  <div>
    <h1>Interactive title</h1>
    <p>Optional short subtitle</p>
  </div>
  <div data-interactive-actions>
    <!-- Optional filter, counter, or activity selector controls. -->
  </div>
</header>
```

Include this near the end of `<head>` in every interactive source:

```html
<script src="scripts/site-shell.js"></script>
```

Do not include it in `index.html` or `about.html`. The build replaces that source reference with `assets/site-shell.js` and `assets/site-shell.css`.

The shared shell still recognizes legacy page structures so existing activities work, but new code should use semantic headings, buttons, labels, and the explicit data attributes above instead of relying on inference.

## Visual design rules

### Colour and theme

- The site bar is dark navy; the interactive bar is indigo. Do not introduce a third header strip or a duplicate title band.
- Use the shared light/dark theme. The preference key is `localStorage.uimode`, with the operating-system preference as the initial fallback.
- The shared shell owns the visible theme button. Do not add a second theme control to lesson content.
- Light mode must use readable dark text. Pale cyan, blue, green, amber, or purple token colours that work on dark surfaces need explicit darker light-mode equivalents.
- Dark mode must style the actual lesson surfaces, inputs, tables, diagrams, code panels, calculators, and feedback—not just the page background.
- Preserve visible focus indicators and adequate contrast. Do not communicate state by colour alone.

### Spacing and sizing

- Use a restrained card system: clear grouping, consistent radii, one primary shadow level, and enough padding for controls to remain legible.
- Buttons need complete labels, comfortable horizontal padding, and room for icons/arrows. Use `gap`, `shrink-0`, and `whitespace-nowrap` where labels might be clipped.
- Avoid large empty regions that push essential actions below the viewport.
- Any flex or grid child containing a table, long code, or dense diagram should normally have `min-width: 0`.
- CSS grids that must fit a fixed column count should use `minmax(0, 1fr)`; do not let cell content establish a wider implicit minimum.
- Tables and code panels may scroll internally when necessary, but the whole page should not gain an accidental horizontal scrollbar.
- At narrower breakpoints, multi-column layouts should stack in a sensible reading order.

### Viewport-height layouts

The production site bar consumes 58px above the activity. Do not use an unconditional `height: 100vh` or Tailwind `h-screen` for a built interactive, because its bottom actions will fall below the viewport.

For an activity that should fill the available screen in both source and production previews, use a named root class:

```css
.example-app {
  height: 100vh;
}

body[data-site-page="interactive"] .example-app {
  height: calc(100vh - 58px);
}
```

Natural-height pages are preferable when the content can reasonably scroll as a document.

## Standard controls

### Topic filters

Topic filters must be consistent across activities:

- The trigger label is **Filter Topics**. Do not include a selected-topic count, “Sub-topics Filter”, or another explanatory label in the title bar.
- Opening is click-controlled. Hover may change styling but must never open or close the menu.
- The menu remains open while checkboxes are changed.
- Use a close control, the topic checkbox list, and one **Apply Filter** button.
- Do not add **Select All**, **Clear All**, or redundant “Select topics” headings unless a specific activity genuinely requires them.
- Keep at least one topic selected and ensure applying the filter replaces or clears a currently displayed question that is no longer allowed.
- The shared shell can normalize many legacy filters, but explicit React state or ordinary click state is preferred over CSS `:hover` menus.

### Activity and question selectors

- Put scenario, graph, task, or question selectors in the interactive title bar when they control the whole activity.
- Keep labels short enough for the title bar; use forms such as **Q1: …** instead of verbose “Problem 1: …” where appropriate.
- For tab lists, the first topic starts selected unless there is a clear pedagogical reason otherwise.
- Do not repeat a separate visible “Question”, “Task”, or “Sub-topic” label when the select itself is clear.

### Calculators

- Scientific calculators are supporting tools, not the main content.
- On desktop, place the calculator in a bounded right-hand support column beside the question.
- On narrow screens, stack it below the question.
- Keep the calculator visually quieter than the primary answer controls.

### Buttons and feedback

- Put **Check Answer** or **Submit Answer** after the learner’s input, not detached above it.
- The primary action is normally the rightmost action; secondary reveal controls are visually quieter.
- Use inline HTML feedback within the activity. Do not use JavaScript `alert()`.
- Use an HTML dialog only when an interruptive modal is truly necessary. Solutions and correctness feedback should normally remain visible alongside the original question.

## Learning-interaction behaviour

These rules are intentional and should be preserved across activities:

- Do not show **Next Question** until the current answer is correct or the learner has requested and seen the solution.
- Do not auto-advance immediately after a correct answer. Show a clear correct message and an explicit next control so the learner has time to reflect.
- **Show Solution** is normally hidden until the learner has attempted an answer.
- Revealed solutions appear inline under the question with explanation and a next control. The learner must be able to review the original prompt and their response.
- Wrong answers should remain editable and give useful, non-destructive feedback.
- Reset attempt, reveal, feedback, and navigation state when a genuinely new question is generated.
- Avoid “Skip Question” paths that bypass the intended attempt/solution sequence unless skipping is part of that activity’s design.
- Random question generation must respect the applied topic filter.

For traces and simulations:

- A trace table records state over time. When a variable, queue, register, or array changes, add a new trace row rather than rewriting the historical row.
- Visual previews must reflect the effective current trace state, not only the initial data.
- Highlight the currently executing pseudocode line without flashing or using a solid black light-mode highlight.
- Keep diagrams and clickable nested components visually separable; labels and child content must not obscure the parent component border.
- Step/reveal controls must remain in view at common laptop resolutions.
- Preserve full values in tooltips when a compact diagram cell uses a shortened display value.

## Common activity layouts

Choose the smallest layout that supports the learning task:

- **Question card:** prompt, input/choices, inline feedback, and gated next action in one bounded card.
- **Question plus support column:** main card on the left; calculator, legend, or compact reference on the right.
- **Visual simulation plus control column:** diagram/simulator on the left; controls, current question, status, and compact data on the right.
- **Split-pane algorithm tracer:** visual data and pseudocode in one pane; editable trace table and fixed action row in the other. Resizers must have sensible minimums and actions must stay visible.
- **Trace table/stepper:** append-only state history with the current editable row clearly distinguished.
- **Tabbed multi-topic activity:** accessible tab list with deterministic initial selection and topic-specific content.
- **Diagram construction/classification:** large interaction surface with the instruction and available choices close to the active target.
- **Canvas simulation:** responsive canvas with controls outside the drawing area; animation loops must not depend on page scrolling.
- **Mastery/revision quiz:** progress and topic filtering in the title bar, with a stable question card and reviewable feedback.

Do not force every page into one component template. Consistency comes from the shared shell, control behaviour, feedback sequencing, spacing, theme, and accessibility—not from making every lesson visually identical.

## Accessibility and content quality

- Use one meaningful `h1` for the activity title and logical lower-level headings.
- Use actual buttons, inputs, labels, selects, tables, and tab semantics instead of clickable generic elements when possible.
- Give icon-only controls an accessible name.
- Keep `aria-expanded` synchronized on menus and disclose dynamic state in visible text.
- Keyboard users must be able to reach and operate all answer and navigation controls.
- Inputs require visible labels or unambiguous nearby prompt text; placeholders are hints, not labels.
- Placeholder text for gap-fill questions should show only the intended first-letter cue, not leak the answer.
- Render mathematical notation through the page’s established KaTeX approach. Do not leave raw delimiters or malformed LaTeX visible.
- Keep AQA terminology, pseudocode conventions, and educational explanations accurate.

## Architecture and important files

- `scripts/build-runtime-js.js`: production compiler and site assembler.
- `scripts/site-shell.js`: shared header discovery, control normalization, filtering/navigation proxies, theme behaviour, and compatibility handling.
- `scripts/site-shell.css`: shared two-bar shell, normalized controls, filter popovers, theme fixes, and responsive rules.
- `scripts/check-no-runtime-babel.js`: rejects runtime Babel/Tailwind compilers and missing built Tailwind assets.
- `scripts/check-site-shell.js`: validates the source/build shell contract and prevents copied production navigation in source.
- `scripts/check-question-markup.js`: validates question markup conventions.
- `scripts/check-interactive-consistency.js`: regression checks for shared behaviour and known interaction/layout decisions.
- `scripts/serve.js`: serves only `dist/` with caching disabled.
- `.vscode/launch.json` and `.vscode/tasks.json`: build-first local debugging.
- `.github/workflows/pages.yml`: build-and-deploy GitHub Pages workflow.

The removed `inject_common.py` was a one-off migration script that batch-mutated source HTML. It is not part of the current architecture. Shared production markup belongs in the deterministic Node build; shared interactive behaviour belongs in the site shell. Do not recreate a broad source-rewriting script for headers, theme controls, or deployment assets.

## Adding or changing a demo

1. Create or edit the root-level HTML source.
2. Keep lesson-specific CSS, data, and logic within that page unless the behaviour genuinely belongs to every activity.
3. Include `scripts/site-shell.js` and one semantic interactive title area; do not author the site-navigation bar.
4. Follow the standard control, feedback, progression, theme, and layout rules above.
5. Add a new activity to the correct section of `index.html`.
6. Add a focused regression assertion to the appropriate check script when fixing a bug that could easily return.
7. Run `npm test`.
8. Inspect the built page through `npm run dev` or the VS Code launch configuration in light and dark modes, at a common laptop viewport and a narrower responsive width.
9. Check the browser console, horizontal overflow, visible action controls, keyboard focus, filtering, incorrect/correct/reveal/next states, and any dynamic previews.

When existing source and generated output differ, diagnose the build before editing `dist/`. When a shared-shell normalization and page-specific markup conflict, prefer making the page explicit and keeping the shared rule conservative.
