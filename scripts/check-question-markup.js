const fs = require('fs');
const path = require('path');
const vm = require('vm');

const sourcePath = path.resolve(__dirname, '..', 'algorithm_classification.html');
const source = fs.readFileSync(sourcePath, 'utf8');
const patternMatch = source.match(/const GAP_FILL_TOKEN_PATTERN\s*=\s*(\/[^\n]+\/g);/);

if (!patternMatch) {
  console.error('Could not find GAP_FILL_TOKEN_PATTERN in algorithm_classification.html.');
  process.exit(1);
}

const tokenPattern = vm.runInNewContext(patternMatch[1], Object.create(null), { timeout: 1000 });
const questionTexts = [...source.matchAll(/\btext:\s*("(?:\\.|[^"\\])*")/g)]
  .map((match) => JSON.parse(match[1]))
  .filter((text) => text.includes('{') && text.includes('|'));
const failures = [];
let tokenCount = 0;

for (const text of questionTexts) {
  const parts = text.split(tokenPattern);
  const unparsed = parts.filter(
    (part) => !part.startsWith('{') && /\{(?:dropdown\||[^|{}]*\|)/.test(part),
  );

  if (unparsed.length > 0) {
    failures.push(`Unparsed token in: ${text}`);
    continue;
  }

  for (const part of parts.filter((value) => value.startsWith('{'))) {
    tokenCount += 1;
    if (!part.endsWith('}')) failures.push(`Incomplete token: ${part}`);
    if (part.startsWith('{dropdown|') && part.slice(10, -1).split('|').length < 2) {
      failures.push(`Dropdown has fewer than two options: ${part}`);
    }
  }
}

if (failures.length > 0) {
  console.error('Question markup validation failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Validated ${tokenCount} gap-fill token(s) in algorithm_classification.html.`);
