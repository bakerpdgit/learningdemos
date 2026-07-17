const fs = require('fs');
const path = require('path');

const sourceRoot = path.resolve(__dirname, '..');
const outputRoot = path.join(sourceRoot, 'dist');
const siteOnlyPages = new Set(['index.html', 'about.html']);
const files = fs.readdirSync(sourceRoot)
  .filter((file) => file.endsWith('.html'))
  .sort();
const failures = [];

function countMatches(source, pattern) {
  return Array.from(source.matchAll(pattern)).length;
}

for (const file of files) {
  const source = fs.readFileSync(path.join(sourceRoot, file), 'utf8');
  const outputPath = path.join(outputRoot, file);
  if (!fs.existsSync(outputPath)) {
    failures.push(`${file}: missing from dist`);
    continue;
  }

  const output = fs.readFileSync(outputPath, 'utf8');
  const sourceShellCount = countMatches(source, /src=["']scripts\/site-shell\.js["']/gi);
  const outputHeaderCount = countMatches(output, /\bdata-site-header(?:\s|=|>)/gi);
  const outputStyleCount = countMatches(output, /href=["']assets\/site-shell\.css["']/gi);
  const outputScriptCount = countMatches(output, /src=["']assets\/site-shell\.js["']/gi);
  const expectedKind = siteOnlyPages.has(file) ? 'site' : 'interactive';

  if (siteOnlyPages.has(file)) {
    if (sourceShellCount !== 0) failures.push(`${file}: site-only source must not load the interactive source shell`);
  } else if (sourceShellCount !== 1) {
    failures.push(`${file}: expected one source interactive-shell script, found ${sourceShellCount}`);
  }

  for (const match of source.matchAll(/<header\b[^>]*>[\s\S]*?<\/header>/gi)) {
    const header = match[0];
    const text = header.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    if (/\bCS\b[\s\S]*?\bLearning\b/i.test(text) && /<a\b[^>]*>[\s\S]*?\bHome\b[\s\S]*?<\/a>/i.test(header)) {
      failures.push(`${file}: copied site navigation remains in source`);
    }
  }

  if (outputHeaderCount !== 1) failures.push(`${file}: expected one built site header, found ${outputHeaderCount}`);
  if (outputStyleCount !== 1) failures.push(`${file}: expected one built shell stylesheet, found ${outputStyleCount}`);
  if (outputScriptCount !== 1) failures.push(`${file}: expected one built shell script, found ${outputScriptCount}`);
  if (!new RegExp(`<body\\b[^>]*data-site-page=["']${expectedKind}["']`, 'i').test(output)) {
    failures.push(`${file}: expected data-site-page="${expectedKind}" on the built body`);
  }
  if (/src=["']scripts\/site-shell\.js["']|href=["']scripts\/site-shell\.css["']/i.test(output)) {
    failures.push(`${file}: source shell asset path leaked into dist`);
  }

  const builtHeader = output.match(/<header\b[^>]*data-site-header[^>]*>[\s\S]*?<\/header>/i);
  if (builtHeader && /data-site-theme-toggle|use (?:dark|light) theme/i.test(builtHeader[0])) {
    failures.push(`${file}: the site navigation header must not contain a theme control`);
  }
}

for (const asset of ['site-shell.css', 'site-shell.js']) {
  if (!fs.existsSync(path.join(outputRoot, 'assets', asset))) {
    failures.push(`dist/assets/${asset}: missing built shell asset`);
  }
}

if (failures.length > 0) {
  console.error('Site shell validation failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`Validated the source/build header contract across ${files.length} page(s).`);
