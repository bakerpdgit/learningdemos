const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const babel = require('@babel/core');
const postcss = require('postcss');
const tailwindcss = require('tailwindcss');

const root = path.resolve(__dirname, '..');
const outputRoot = path.join(root, 'dist');
const assetOutputRoot = path.join(outputRoot, 'assets');
const tailwindOutputRoot = path.join(outputRoot, 'assets', 'tailwind');
const htmlFiles = fs.readdirSync(root)
  .filter((file) => file.endsWith('.html'))
  .sort();

const babelScriptPattern = /\s*<script\b[^>]*src=["'][^"']*(?:@babel\/standalone|babel-standalone)[^"']*["'][^>]*><\/script>\s*/gi;
const babelBlockPattern = /<script\b([^>]*)type=["']text\/babel["']([^>]*)>([\s\S]*?)<\/script>/gi;
const babelCommentPattern = /\s*<!--[^>]*\bBabel\b[^>]*-->\s*/gi;
const tailwindCdnPattern = /\s*<script\b[^>]*src=["']https:\/\/cdn\.tailwindcss\.com(?:\/[^"']*)?["'][^>]*><\/script>\s*/gi;
const inlineScriptPattern = /<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
const tailwindInput = '@tailwind base;\n@tailwind components;\n@tailwind utilities;\n';
const sourceShellAssetPattern = /\s*<(?:script\b[^>]*src=["']scripts\/site-shell\.js["'][^>]*><\/script>|link\b[^>]*href=["']scripts\/site-shell\.css["'][^>]*>)\s*/gi;
const siteOnlyPages = new Set(['index.html', 'about.html']);
const siteHeader = `
  <header class="site-shell-header" data-site-header>
    <a class="site-shell-brand" href="index.html" aria-label="CS Learning home">
      <span class="site-shell-brand-mark">&lt;</span><span class="site-shell-brand-name">CS</span><span class="site-shell-brand-mark">&gt;</span>
      <span class="site-shell-brand-word">Learning</span>
    </a>
    <nav aria-label="Site navigation">
      <a class="site-shell-home" href="index.html">Home</a>
    </nav>
  </header>`;

// These are the only utilities assembled from variable fragments in the source.
// Tailwind cannot discover partial class names, so keep their finite variants explicit.
const dynamicTailwindSafelist = [
  'bg-amber-600',
  'bg-blue-600',
  'bg-orange-600',
  'bg-purple-600',
  'bg-teal-600',
  'border-blue-600',
  'border-orange-600',
  'border-purple-600',
  'hover:bg-blue-50',
  'hover:bg-orange-50',
  'hover:bg-purple-50',
  'text-blue-600',
  'text-orange-600',
  'text-purple-600',
];

function readTailwindConfig(file, source) {
  for (const match of source.matchAll(inlineScriptPattern)) {
    const body = match[1];
    const assignment = body.match(/^\s*tailwind\.config\s*=\s*([\s\S]*?)\s*;?\s*$/);
    if (!assignment) continue;

    let config;
    try {
      const evaluated = vm.runInNewContext(`(${assignment[1]})`, Object.create(null), {
        timeout: 1000,
      });
      config = JSON.parse(JSON.stringify(evaluated));
    } catch (error) {
      throw new Error(`Could not read Tailwind configuration in ${file}: ${error.message}`);
    }

    return { config, script: match[0] };
  }

  throw new Error(`${file} loads the Tailwind CDN but has no inline tailwind.config assignment.`);
}

function groupTailwindPages(pages) {
  const groups = new Map();

  for (const page of pages) {
    if (!tailwindCdnPattern.test(page.source)) {
      tailwindCdnPattern.lastIndex = 0;
      continue;
    }
    tailwindCdnPattern.lastIndex = 0;

    const tailwind = readTailwindConfig(page.file, page.source);
    const key = JSON.stringify(tailwind.config);
    const group = groups.get(key) || { config: tailwind.config, pages: [] };
    group.pages.push({ ...page, configScript: tailwind.script });
    groups.set(key, group);
  }

  return groups;
}

async function buildTailwindStyles(groups) {
  fs.mkdirSync(tailwindOutputRoot, { recursive: true });
  const assetsByFile = new Map();

  for (const [configKey, group] of groups) {
    const hash = crypto.createHash('sha256').update(configKey);
    for (const page of group.pages) hash.update(page.file).update(page.source);
    const assetName = `tailwind-${hash.digest('hex').slice(0, 12)}.css`;
    const assetPath = path.join(tailwindOutputRoot, assetName);

    const result = await postcss([
      tailwindcss({
        ...group.config,
        content: group.pages.map((page) => ({ raw: page.source, extension: 'html' })),
        safelist: [
          ...(Array.isArray(group.config.safelist) ? group.config.safelist : []),
          ...dynamicTailwindSafelist,
        ],
      }),
    ]).process(tailwindInput, { from: undefined });

    fs.writeFileSync(assetPath, result.css);
    for (const page of group.pages) {
      assetsByFile.set(page.file, {
        configScript: page.configScript,
        href: `assets/tailwind/${assetName}`,
      });
    }
  }

  return assetsByFile;
}

function compileJsx(file, source) {
  let changed = false;
  let next = source.replace(babelScriptPattern, '\n').replace(babelCommentPattern, '\n');
  if (next !== source) changed = true;

  next = next.replace(babelBlockPattern, (match, beforeAttrs, afterAttrs, jsx) => {
    changed = true;
    const result = babel.transformSync(jsx, {
      filename: file,
      babelrc: false,
      configFile: false,
      compact: false,
      comments: true,
      plugins: [[require('@babel/plugin-transform-react-jsx'), { runtime: 'classic' }]],
    });

    const attrs = `${beforeAttrs} ${afterAttrs}`
      .replace(/\s*data-type=["'][^"']*["']/gi, '')
      .replace(/\s*data-plugins=["'][^"']*["']/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
    const attrText = attrs ? ` ${attrs}` : '';
    return `<script${attrText}>${result.code}</script>`;
  });

  return { changed, source: next };
}

function injectSiteShell(file, source) {
  const pageKind = siteOnlyPages.has(file) ? 'site' : 'interactive';
  let output = source.replace(sourceShellAssetPattern, '\n');

  output = output.replace(
    /<\/head>/i,
    '    <link rel="stylesheet" href="assets/site-shell.css" data-site-shell-styles>\n' +
    '    <script src="assets/site-shell.js"></script>\n</head>',
  );

  output = output.replace(/<body\b([^>]*)>/i, (body, attributes) => {
    const cleaned = attributes.replace(/\sdata-site-page=["'][^"']*["']/i, '');
    return `<body${cleaned} data-site-page="${pageKind}">${siteHeader}`;
  });

  return output;
}

async function build() {
  const pages = htmlFiles.map((file) => ({
    file,
    source: fs.readFileSync(path.join(root, file), 'utf8'),
  }));

  fs.rmSync(outputRoot, { recursive: true, force: true });
  fs.mkdirSync(outputRoot, { recursive: true });

  const tailwindGroups = groupTailwindPages(pages);
  const tailwindAssets = await buildTailwindStyles(tailwindGroups);
  let transformedFiles = 0;

  for (const page of pages) {
    const compiled = compileJsx(page.file, page.source);
    let output = compiled.source;
    const tailwind = tailwindAssets.get(page.file);

    if (tailwind) {
      output = output
        .replace(tailwindCdnPattern, `\n    <link rel="stylesheet" href="${tailwind.href}">\n`)
        .replace(tailwind.configScript, '\n')
        .replace(/<!--\s*Tailwind CSS(?:\s+for styling)?\s*-->/gi, '<!-- Built Tailwind CSS -->');
    }

    output = injectSiteShell(page.file, output);

    fs.writeFileSync(path.join(outputRoot, page.file), output);
    if (compiled.changed) transformedFiles += 1;
  }

  fs.mkdirSync(assetOutputRoot, { recursive: true });
  for (const file of ['site-shell.css', 'site-shell.js']) {
    fs.copyFileSync(path.join(root, 'scripts', file), path.join(assetOutputRoot, file));
  }

  for (const file of ['CNAME']) {
    const sourcePath = path.join(root, file);
    if (fs.existsSync(sourcePath)) {
      fs.copyFileSync(sourcePath, path.join(outputRoot, file));
    }
  }

  const archivePath = path.join(root, 'archive');
  if (fs.existsSync(archivePath)) {
    fs.cpSync(archivePath, path.join(outputRoot, 'archive'), { recursive: true });
  }

  fs.writeFileSync(path.join(outputRoot, '.nojekyll'), '');

  console.log(
    `Built ${htmlFiles.length} HTML file(s) in dist; ` +
    `precompiled JSX in ${transformedFiles} file(s); ` +
    `generated ${tailwindGroups.size} Tailwind stylesheet(s) for ${tailwindAssets.size} page(s).`,
  );
}

build().catch((error) => {
  console.error(error);
  process.exit(1);
});
