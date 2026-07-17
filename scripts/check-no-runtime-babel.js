const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', 'dist');
const sourceRoot = path.resolve(__dirname, '..');
const offenders = [];
const missingAssets = [];

if (!fs.existsSync(root)) {
  console.error('dist does not exist. Run npm run build first.');
  process.exit(1);
}

function checkDirectory(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      checkDirectory(filePath);
    } else if (entry.name.endsWith('.html')) {
      const source = fs.readFileSync(filePath, 'utf8');
      const relativePath = path.relative(root, filePath);
      const reasons = [];
      if (/type=["']text\/babel["']|@babel\/standalone|babel-standalone/i.test(source)) {
        reasons.push('runtime Babel');
      }
      if (/<!--[^>]*\bBabel\b[^>]*-->/i.test(source)) {
        reasons.push('stale Babel comment');
      }
      if (/cdn\.tailwindcss\.com|@tailwindcss\/browser|tailwind\.config\s*=/i.test(source)) {
        reasons.push('runtime Tailwind compiler');
      }
      for (const reason of reasons) offenders.push(`${relativePath}: ${reason}`);

      for (const match of source.matchAll(/<link\b[^>]*href=["'](assets\/tailwind\/[^"']+\.css)["'][^>]*>/gi)) {
        const assetPath = path.resolve(root, match[1]);
        if (!fs.existsSync(assetPath)) missingAssets.push(`${relativePath}: ${match[1]}`);
      }
    }
  }
}

checkDirectory(root);

for (const file of fs.readdirSync(sourceRoot).filter((name) => name.endsWith('.html'))) {
  const source = fs.readFileSync(path.join(sourceRoot, file), 'utf8');
  if (!/cdn\.tailwindcss\.com/i.test(source)) continue;

  const output = fs.readFileSync(path.join(root, file), 'utf8');
  if (!/<link\b[^>]*href=["']assets\/tailwind\/[^"']+\.css["'][^>]*>/i.test(output)) {
    missingAssets.push(`${file}: no built Tailwind stylesheet link`);
  }
}

if (offenders.length > 0) {
  console.error('Production build dependencies remain in:');
  for (const offender of offenders) console.error(`- ${offender}`);
  process.exit(1);
}

if (missingAssets.length > 0) {
  console.error('Built Tailwind assets are missing:');
  for (const asset of missingAssets) console.error(`- ${asset}`);
  process.exit(1);
}

console.log('No runtime Babel or Tailwind compilers found in dist HTML files.');
