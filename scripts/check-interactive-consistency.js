const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const files = fs.readdirSync(root).filter((file) => file.endsWith('.html')).sort();
const failures = [];

function extractFunctionBody(source, name) {
  const match = new RegExp(`function\\s+${name}\\s*\\(`).exec(source);
  if (!match) return '';
  const bodyStart = source.indexOf('{', match.index + match[0].length);
  if (bodyStart < 0) return '';

  let depth = 0;
  let quote = null;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  for (let index = bodyStart; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];
    if (lineComment) {
      if (character === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      if (character === '*' && next === '/') {
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if (quote) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === quote) quote = null;
      continue;
    }
    if (character === '/' && next === '/') {
      lineComment = true;
      index += 1;
      continue;
    }
    if (character === '/' && next === '*') {
      blockComment = true;
      index += 1;
      continue;
    }
    if (character === '"' || character === "'" || character === '`') {
      quote = character;
      continue;
    }
    if (character === '{') depth += 1;
    if (character === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(bodyStart + 1, index);
    }
  }
  return '';
}

function extractJsxAttributeExpressions(source, attribute) {
  const expressions = [];
  const startPattern = new RegExp(`\\b${attribute}\\s*=\\s*\\{`, 'g');
  let match;
  while ((match = startPattern.exec(source))) {
    const bodyStart = source.indexOf('{', match.index);
    let depth = 0;
    let quote = null;
    let escaped = false;
    for (let index = bodyStart; index < source.length; index += 1) {
      const character = source[index];
      if (quote) {
        if (escaped) escaped = false;
        else if (character === '\\') escaped = true;
        else if (character === quote) quote = null;
        continue;
      }
      if (character === '"' || character === "'" || character === '`') {
        quote = character;
        continue;
      }
      if (character === '{') depth += 1;
      if (character === '}') {
        depth -= 1;
        if (depth === 0) {
          expressions.push(source.slice(bodyStart + 1, index));
          startPattern.lastIndex = index + 1;
          break;
        }
      }
    }
  }
  return expressions;
}

function cssRules(source) {
  const withoutComments = source.replace(/\/\*[\s\S]*?\*\//g, '');
  return Array.from(withoutComments.matchAll(/([^{}]+)\{([^{}]*)\}/g), (match) => ({
    selectors: match[1],
    declarations: match[2],
  }));
}

const visibleInitialPatterns = [
  /\{(?:currentQuestion|question|q)\.(?:firstLetter|hintLetter)\}\s*<\/span>/,
  /\{word\.initial\}/,
  /\{init\}\s*<\/span>/,
  /\{seg\.hint\}\s*<\/span>/,
  /\{w\[0\]\.toUpperCase\(\)\}/,
  /\{part\.prefix\}\s*<\/span>/,
  /\{p\.hint\}\s*<\/span>/,
  /first[- ]letter hint|first letter provided|missing letters after|type remainder|finish the word/i,
];

for (const file of files) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  for (const pattern of visibleInitialPatterns) {
    if (pattern.test(source)) {
      failures.push(`${file}: still renders or describes a first-letter prefix (${pattern})`);
    }
  }

  const singleCharacterPairs = [
    ...source.matchAll(/firstLetter\s*:\s*["']([^"'\r\n])["']\s*,\s*fullWord\s*:\s*["']([^"'\r\n])["']/g),
    ...source.matchAll(/fullWord\s*:\s*["']([^"'\r\n])["']\s*,\s*firstLetter\s*:\s*["']([^"'\r\n])["']/g),
  ].filter((match) => match[1] === match[2]);
  if (singleCharacterPairs.length > 0) {
    const firstLetterPlaceholders = extractJsxAttributeExpressions(source, 'placeholder')
      .filter((expression) => /firstLetter/.test(expression));
    firstLetterPlaceholders.forEach((expression) => {
      const guardsAgainstFullAnswer = /fullWord\s*\.\s*length/.test(expression)
        && /firstLetter\s*\.\s*length/.test(expression)
        && /["']\s*["']/.test(expression);
      if (!guardsAgainstFullAnswer) {
        failures.push(`${file}: a firstLetter placeholder can reveal a complete one-character fullWord`);
      }
    });
  }
}

const shellSource = fs.readFileSync(path.join(root, 'scripts', 'site-shell.js'), 'utf8');
const shellCssSource = fs.readFileSync(path.join(root, 'scripts', 'site-shell.css'), 'utf8');
for (const marker of [
  'standardizeFilterPanel',
  'createStandaloneFilter',
  'normalizeQuestionSelect',
  'normalizeTitleBlock',
  'normalizeStats',
  'normalizeThemedSurfaces',
  'normalizeContentSpacing',
]) {
  if (!shellSource.includes(marker)) failures.push(`scripts/site-shell.js: missing ${marker}`);
}

const placeholderAlignmentRule = cssRules(shellCssSource).find(({ selectors, declarations }) => (
  selectors.includes('input::placeholder')
  && selectors.includes('textarea::placeholder')
  && /text-align\s*:\s*left\s*!important\s*;/i.test(declarations)
));
if (!placeholderAlignmentRule) {
  failures.push('scripts/site-shell.css: missing the shared left-aligned input/textarea placeholder rule');
}

const compressionSource = fs.readFileSync(path.join(root, 'compression.html'), 'utf8');
if (/<([a-z][\w-]*)\b[^>]*>\s*\{\s*part\.hint(?:[^}]*)\}\s*<\/\1>\s*<input\b/i.test(compressionSource)) {
  failures.push('compression.html: part.hint is still rendered as a separate prefix before the gap input');
}
if (!extractJsxAttributeExpressions(compressionSource, 'placeholder').some((expression) => /part\.hint/.test(expression))) {
  failures.push('compression.html: the gap input no longer carries part.hint inside its placeholder');
}
const dictDecodeSection = compressionSource.slice(
  compressionSource.indexOf('const DictDecodeTask'),
  compressionSource.indexOf('const App =', compressionSource.indexOf('const DictDecodeTask')),
);
if (!/normalizedInput[\s\S]*toLocaleLowerCase\(["']en-GB["']\)[\s\S]*normalizedExpected/.test(dictDecodeSection)) {
  failures.push('compression.html: dictionary-decoded natural words must be compared case-insensitively');
}
const rleDecodeSection = compressionSource.slice(
  compressionSource.indexOf('const RLEDecodeTask'),
  compressionSource.indexOf('const Dict', compressionSource.indexOf('const RLEDecodeTask')),
);
if (/toLocaleLowerCase|toLowerCase/.test(rleDecodeSection)) {
  failures.push('compression.html: lossless RLE reconstruction must retain intentional case-sensitive data matching');
}

const programmingTechniquesSource = fs.readFileSync(path.join(root, 'programming_techniques.html'), 'utf8');
const textMatchBody = programmingTechniquesSource.slice(
  programmingTechniquesSource.indexOf('const checkTextMatch'),
  programmingTechniquesSource.indexOf('// --- TOPICS', programmingTechniquesSource.indexOf('const checkTextMatch')),
);
if (!/cleanFullAnswer[\s\S]*cleanPrefix\s*\+\s*cleanCorrect[\s\S]*cleanInput\s*===\s*cleanFullAnswer/.test(textMatchBody)) {
  failures.push('programming_techniques.html: whole-word answers must match the stored prefix plus suffix case-insensitively');
}

if (/\bobserver\s*\.\s*disconnect\s*\(/.test(shellSource)) {
  failures.push('scripts/site-shell.js: the shared MutationObserver must remain active for late React remounts');
}
const scheduleBody = extractFunctionBody(shellSource, 'scheduleNormalize');
if (!/normalizeScheduled/.test(scheduleBody)
  || !/if\s*\([^)]*normalizeScheduled[^)]*\)\s*return/.test(scheduleBody)
  || !/normalizeScheduled\s*=\s*true\s*;[\s\S]*requestAnimationFrame/.test(scheduleBody)
  || !/requestAnimationFrame[\s\S]*normalizeScheduled\s*=\s*false\s*;/.test(scheduleBody)) {
  failures.push('scripts/site-shell.js: scheduleNormalize must debounce mutation bursts with normalizeScheduled');
}

const navigationFinderBody = extractFunctionBody(shellSource, 'findNavigationSelect');
if (!/!\s*select\.matches\(\s*["'][^"']*data-interactive-navigation-proxy-select/.test(navigationFinderBody)
  || !/!\s*select\.closest\(\s*["'][^"']*data-interactive-navigation-proxy/.test(navigationFinderBody)) {
  failures.push('scripts/site-shell.js: navigation discovery must exclude its own proxy select and wrapper');
}
const navigationNormalizerBody = extractFunctionBody(shellSource, 'normalizeQuestionSelect');
if (!/proxy\._interactiveShellSource\s*=\s*original\s*;/.test(navigationNormalizerBody)
  || !/(?:const|let)\s+source\s*=\s*proxy\._interactiveShellSource\s*;/.test(navigationNormalizerBody)) {
  failures.push('scripts/site-shell.js: the navigation proxy must refresh and use its currently mounted source select');
}

const filterProxyBody = extractFunctionBody(shellSource, 'createFilterProxy');
if (!/_interactiveShellSource\s*=\s*original/.test(filterProxyBody)
  || !/source\?\.isConnected/.test(filterProxyBody)) {
  failures.push('scripts/site-shell.js: filter proxies must use a refreshable, currently connected React source control');
}
const actionsHostBody = extractFunctionBody(shellSource, 'findActionsHost');
const interactiveNormalizerBody = extractFunctionBody(shellSource, 'normalizeInteractiveHeader');
if (!/interactive-shell-stat/.test(actionsHostBody)
  || interactiveNormalizerBody.indexOf('normalizeStats()') > interactiveNormalizerBody.indexOf('const localFilter')) {
  failures.push('scripts/site-shell.js: title-bar actions must group counters with filters before selecting the actions host');
}

const filterTriggerBody = extractFunctionBody(shellSource, 'standardizeFilterTrigger');
if (!/classList\.add\(\s*["']interactive-shell-control["']\s*\)/.test(filterTriggerBody)
  || !/dataset\.interactiveFilter\s*=/.test(filterTriggerBody)
  || !/setAttribute\(\s*["']aria-label["']\s*,\s*["']Filter Topics["']\s*\)/.test(filterTriggerBody)
  || !/textContent\s*=\s*["']Filter Topics["']/.test(filterTriggerBody)) {
  failures.push('scripts/site-shell.js: authored topic triggers must be normalized to the Filter Topics control and label');
}
const filterDiscoveryBody = extractFunctionBody(shellSource, 'isFilterControl');
if (!/data-interactive-filter-proxy/.test(filterDiscoveryBody)) {
  failures.push('scripts/site-shell.js: filter discovery must ignore title-bar proxies so remounted React sources can be rebound');
}
const closeFilterBody = extractFunctionBody(shellSource, 'closeFilter');
if (!/data-shell-hover-filter/.test(closeFilterBody)) {
  failures.push('scripts/site-shell.js: closing a hover-authored filter must not click its trigger and force the panel back open');
}
const standaloneFilterBody = extractFunctionBody(shellSource, 'createStandaloneFilter');
if (!/existing\.remove\(\)/.test(standaloneFilterBody)
  || !/hideStandaloneFilterSource\(source\)/.test(standaloneFilterBody)) {
  failures.push('scripts/site-shell.js: generated standalone filters must rebuild and hide the current source after React remounts');
}
const filterPanelBody = extractFunctionBody(shellSource, 'standardizeFilterPanel');
if (/topics\?\|categories\$/.test(filterPanelBody)
  || !/topics\?\|categories\)\$/.test(filterPanelBody)) {
  failures.push('scripts/site-shell.js: legacy filter-heading detection must not hide option labels beginning with Topic');
}
const lightFilterRule = cssRules(shellCssSource).find(({ selectors, declarations }) => (
  selectors.includes('html:not(.dark)')
  && selectors.includes('[data-interactive-filter]')
  && selectors.includes('[data-interactive-filter-proxy]')
  && /background(?:-color)?\s*:\s*(?:#fff(?:fff)?|white|rgb\(\s*255(?:[,\s]+255){2})\s*!important\s*;/i.test(declarations)
  && /border-color\s*:[^;]+!important\s*;/i.test(declarations)
  && /color\s*:[^;]+!important\s*;/i.test(declarations)
));
if (!lightFilterRule) {
  failures.push('scripts/site-shell.css: Filter Topics triggers need a shared high-contrast light-mode control style');
}
if (!/--interactive-shell-filter-shift-y/.test(shellSource)
  || !/--interactive-shell-filter-shift-y/.test(shellCssSource)) {
  failures.push('shared filter placement must support vertical correction so an open panel cannot cover a wrapped title bar');
}
if (!/interactive-shell-filter-legacy-heading/.test(shellSource)
  || !/\(\?:select\|filter\).*sub-\?/.test(shellSource)
  || !/\.interactive-shell-filter-legacy-heading\s*\{[^}]*display\s*:\s*none\s*!important/s.test(shellCssSource)) {
  failures.push('shared filters must remove obsolete Select Topics/Sub-topics header bands');
}
if (!/\.interactive-shell-question-control \[data-interactive-navigation-label\]\s*\{[^}]*display\s*:\s*none\s*!important/s.test(shellCssSource)) {
  failures.push('title-bar question selects must not repeat a redundant visible Question/Task label');
}
if (!/html:not\(\.dark\)[^{]*interactive-shell-light-surface[^{]*text-blue-300/.test(shellCssSource)
  || !/html:not\(\.dark\)[^{]*interactive-shell-light-surface[^{]*text-green-300/.test(shellCssSource)
  || !/html:not\(\.dark\)[^{]*interactive-shell-light-surface[^{]*text-orange-300/.test(shellCssSource)) {
  failures.push('light-mode normalized code surfaces need an accessible dark syntax-token palette');
}
const functionalProgrammingSource = fs.readFileSync(path.join(root, 'functional_programming.html'), 'utf8');
if (!/html:not\(\.dark\)\s+code\s*\{\s*color\s*:\s*#1d4ed8\s*;\s*\}/i.test(functionalProgrammingSource)) {
  failures.push('functional_programming.html: light-mode guide code needs a readable dark-blue colour');
}
if (!/interactive-shell-card-content-gap/.test(shellSource)
  || !/\.interactive-shell-card-content-gap\s*\{[^}]*margin-top\s*:/s.test(shellCssSource)) {
  failures.push('bounded lesson cards need a visible content gap below an extracted title bar');
}

const filterReconciliationChecks = [
  ['searching_and_sorting.html', /selectedTopics\.includes\(activeProblem\.topic\)[\s\S]*setActiveProblem\(nextAllowedProblem\)/],
  ['dijkstra.html', /selectedDifficulties\.includes\(activeGraph\.difficulty\)[\s\S]*setActiveGraph\(nextAllowedGraph\)/],
  ['aqa_vectors_interactive.html', /q\s*&&\s*!selectedTopics\.includes\(q\.type\)[\s\S]*generateNewQuestion\(\)/],
  ['ip_addressing_interactive.html', /!state\.selectedTopics\.has\(state\.current\.topic\)[\s\S]*newQuestion\(\)/],
  ['von_neumann_architecture.html', /question\s*&&\s*!selectedTopics\[question\.topic\][\s\S]*setQuestion\(null\)/],
];
for (const [file, pattern] of filterReconciliationChecks) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  if (!pattern.test(source)) failures.push(`${file}: filtering must replace or clear content excluded by the applied topics`);
}
const vonNeumannMemorySource = fs.readFileSync(path.join(root, 'von_neumann_architecture.html'), 'utf8');
if (!/const formatMemoryCellValue\s*=/.test(vonNeumannMemorySource)
  || !/return `\$\{mnemonic\}\.\.\.`;/.test(vonNeumannMemorySource)
  || !/grid-template-columns:\s*repeat\(10,\s*minmax\(0,\s*1fr\)\)/.test(vonNeumannMemorySource)
  || !/processor-side-panel\s*\{\s*width:\s*calc\(32% - 0\.5rem\)\s*!important;/s.test(vonNeumannMemorySource)
  || !/processor-layout[^"']*overflow-x-hidden/.test(vonNeumannMemorySource)
  || !/title=\{tooltip\}[\s\S]{0,400}\{formatMemoryCellValue\(displayVal\)\}/.test(vonNeumannMemorySource)) {
  failures.push('von_neumann_architecture.html: RAM must fit ten compact mnemonic cells without horizontal overflow while keeping full hover tooltips');
}

const nextQuestionGateChecks = [
  ['bnf_and_syntax_diagrams.html', /\{\(feedback === "correct" \|\| showSolution\) && \([\s\S]{0,800}Next Question/],
  ['aqa_sets.html', /\{\(status === "correct" \|\| showSolution\) && \([\s\S]{0,800}Next Question/],
  ['aqa_vectors_interactive.html', /\{\(feedback\?\.correct \|\| showSolution\) && \([\s\S]{0,800}Next Question/],
];
for (const [file, pattern] of nextQuestionGateChecks) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  if (!pattern.test(source)) failures.push(`${file}: Next Question must remain hidden until the answer is correct or its solution is shown`);
}

const fsmSource = fs.readFileSync(path.join(root, 'fsm_and_regex.html'), 'utf8');
if (/← Previous|Next →/.test(fsmSource)) {
  failures.push('fsm_and_regex.html: redundant Previous/Next title-bar buttons must remain removed');
}
const bnfSource = fs.readFileSync(path.join(root, 'bnf_and_syntax_diagrams.html'), 'utf8');
if (/Select Sub-topics/.test(bnfSource) || !/<h1[^>]*>[\s\S]*BNF & Syntax Diagrams[\s\S]*<\/h1>/.test(bnfSource)) {
  failures.push('bnf_and_syntax_diagrams.html: title must be semantic and the obsolete filter heading removed');
}
const bnfPlaygroundSource = fs.readFileSync(path.join(root, 'bnf_syntax_playground.html'), 'utf8');
if (/\balert\s*\(/.test(bnfPlaygroundSource)
  || !/<h1[^>]*>BNF & Syntax Diagram Playground<\/h1>/.test(bnfPlaygroundSource)
  || !/role="tablist"/.test(bnfPlaygroundSource)
  || (bnfPlaygroundSource.match(/role="tab"/g) || []).length < 2
  || !/const \[tab, setTab\] = useState\("bnf"\)/.test(bnfPlaygroundSource)
  || !/\{tab === "bnf" \? \(/.test(bnfPlaygroundSource)) {
  failures.push('bnf_syntax_playground.html: the BNF and syntax-diagram views must stay in one tab set so only one of them is on screen at a time');
}
if (!/const addComponent = \(kind\)/.test(bnfPlaygroundSource)
  || !/const activateForConnect = \(id\)/.test(bnfPlaygroundSource)
  || !/const deleteSelection = \(\)/.test(bnfPlaygroundSource)
  || !/onAddRule/.test(bnfPlaygroundSource)
  || !/onDeleteRule/.test(bnfPlaygroundSource)) {
  failures.push('bnf_syntax_playground.html: the designer must let a learner add a component, draw a connector between components, delete either, and add or remove whole rules');
}
// Direction markers sit at the midpoint of every connector: a forward arrow
// reads as a choice of route and a backward one as repetition.
if (!/transform=\{"translate\(" \+ geometry\.mx \+ " " \+ geometry\.my \+ "\) rotate\(" \+ geometry\.angle \+ "\)"\}/.test(bnfPlaygroundSource)
  || !/sd-edge-back/.test(bnfPlaygroundSource)
  || !/sd-arrow-back/.test(bnfPlaygroundSource)) {
  failures.push('bnf_syntax_playground.html: every connector needs a direction arrow at its midpoint, with backward (repetition) connectors distinguished from forward (choice) ones');
}
// An unfinished diagram must never be written back into the grammar, and a
// rule body is only ever written if it re-reads as exactly the same structure.
if (!/validateGraph\(nextGraph, ruleNames\)\.some\(\(issue\) => issue\.blocking\)/.test(bnfPlaygroundSource)
  || !/function roundTripsCleanly/.test(bnfPlaygroundSource)
  || !/roundTripsCleanly\(body, candidate, ebnf\)/.test(bnfPlaygroundSource)
  || !/const REGEX_BUDGET/.test(bnfPlaygroundSource)) {
  failures.push('bnf_syntax_playground.html: a diagram with floating or unreachable components must leave the grammar text alone, and a compiled rule body must re-parse to the structure it came from');
}
if (!/if \(nullable\.has\(symbol\.nt\)\)/.test(bnfPlaygroundSource)
  || !/const parents = columns\[item\.start\]\.byNext\.get\(production\.lhs\)/.test(bnfPlaygroundSource)) {
  failures.push('bnf_syntax_playground.html: the chart parser must keep advancing past nullable non-terminals so EBNF [ ] and { } rules still match');
}

const abstractionSource = fs.readFileSync(path.join(root, 'abstraction_and_automation.html'), 'utf8');
if (/Select All/.test(abstractionSource)
  || !/next-question-button[\s\S]*?shrink-0[\s\S]*?gap-2[\s\S]*?whitespace-nowrap/.test(abstractionSource)) {
  failures.push('abstraction_and_automation.html: filter footer must expose only Apply Filter and Next Question must preserve its arrow padding');
}
const consequencesSource = fs.readFileSync(path.join(root, 'consequences.html'), 'utf8');
if (!/data-interactive-flat-header/.test(consequencesSource)
  || /Topics Filter/.test(consequencesSource)
  || !/>Filter Topics<\/span>/.test(consequencesSource)
  || !/\.interactive-shell-header\[data-interactive-flat-header\]\s*\{[^}]*box-shadow\s*:\s*none\s*!important/s.test(shellCssSource)) {
  failures.push('consequences.html: the title bar must have no shadow strip and a single Filter Topics label');
}
const softwareClassificationSource = fs.readFileSync(path.join(root, 'software_classification.html'), 'utf8');
if (/Sub-topics Filter/.test(softwareClassificationSource) || !/>Filter Topics<\/span>/.test(softwareClassificationSource)) {
  failures.push('software_classification.html: the topic filter trigger must use the shared Filter Topics label once');
}
const secondaryStorageSource = fs.readFileSync(path.join(root, 'secondary_storage.html'), 'utf8');
if (/Topics Selected:/.test(secondaryStorageSource)
  || /Select Sub-topics/.test(secondaryStorageSource)
  || !/>Filter Topics<\/span>/.test(secondaryStorageSource)
  || !/className="interactive-shell-filter-option flex items-center/.test(secondaryStorageSource)
  || !/<h1>Storage Devices<\/h1>/.test(secondaryStorageSource)) {
  failures.push('secondary_storage.html: the topic filter must use the shared label and keep its first option out of the title styling');
}
const hardwareSource = fs.readFileSync(path.join(root, 'hardware.html'), 'utf8');
if (/Topics Selected:/.test(hardwareSource) || !/>Filter Topics<\/span>/.test(hardwareSource)) {
  failures.push('hardware.html: the topic filter trigger must not expose a selected-topic count');
}
const ipAddressingSource = fs.readFileSync(path.join(root, 'ip_addressing_interactive.html'), 'utf8');
if (/Press\s*<strong>Enter<\/strong>\s*to submit answers quickly\./.test(ipAddressingSource)
  || /Reveal Worked Answer/.test(ipAddressingSource)
  || !/id="answerArea"><\/div>\s*<div class="answer-actions">[\s\S]*?id="submitBtn"[\s\S]*?id="revealBtn"[^>]*hidden/.test(ipAddressingSource)
  || !/state\.hasAttemptedAnswer\s*=\s*true\s*;\s*updateAnswerControls\(\)/.test(ipAddressingSource)
  || !/state\.hasAttemptedAnswer\s*=\s*false\s*;[\s\S]{0,120}updateAnswerControls\(\)/.test(ipAddressingSource)) {
  failures.push('ip_addressing_interactive.html: answer controls must follow the input and Show Solution must appear only after submission');
}
const assemblyChallengesSource = fs.readFileSync(path.join(root, 'aqa_assembly_challenges.html'), 'utf8');
if (/Problem \$\{c\.id\}: \$\{c\.title\}/.test(assemblyChallengesSource)
  || !/Q\$\{c\.id\}: \$\{c\.title\}/.test(assemblyChallengesSource)) {
  failures.push('aqa_assembly_challenges.html: challenge selector options must use the compact Qn prefix');
}
const logicCircuitsSource = fs.readFileSync(path.join(root, 'logic_circuits.html'), 'utf8');
if (!/const\s*\[topic,\s*setTopic\]\s*=\s*useState\(Object\.keys\(TOPICS\)\[0\]\)/.test(logicCircuitsSource)) {
  failures.push('logic_circuits.html: the initial question topic must be the first tab');
}
const searchingSortingSource = fs.readFileSync(path.join(root, 'searching_and_sorting.html'), 'utf8');
if (!/const getTraceArray = \(\) =>[\s\S]*?effState\[`arr\[\$\{idx\}\]`\]/.test(searchingSortingSource)
  || !/const displayedArray = getTraceArray\(\);[\s\S]*?\{displayedArray\.map\(\(val, idx\) =>/.test(searchingSortingSource)) {
  failures.push('searching_and_sorting.html: the array preview must reflect the effective arr[n] values in the trace table');
}
if (!/\.search-sort-app\s*\{\s*height:\s*100vh\s*;/s.test(searchingSortingSource)
  || !/body\[data-site-page="interactive"\] \.search-sort-app\s*\{\s*height:\s*calc\(100vh - 58px\)\s*;/s.test(searchingSortingSource)
  || !/className="search-sort-app flex flex-col overflow-hidden/.test(searchingSortingSource)
  || /search-sort-app[^"']*\bh-screen\b/.test(searchingSortingSource)) {
  failures.push('searching_and_sorting.html: the app must subtract the built site bar so bottom trace controls remain in the viewport');
}
const floatingPointSource = fs.readFileSync(path.join(root, 'aqa_floating_point.html'), 'utf8');
if (!/practice-layout\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\) minmax\(280px, 320px\)/.test(floatingPointSource)
  || !/id="nextBtn"[^>]*style="display:none"/.test(floatingPointSource)
  || !/getElementById\('nextBtn'\)\.style\.display = ''/.test(floatingPointSource)) {
  failures.push('aqa_floating_point.html: calculator must be a desktop sidebar and Next Question must stay hidden until an answer is resolved');
}
const networkConfigurationSource = fs.readFileSync(path.join(root, 'network_configuration.html'), 'utf8');
if (/Designed for AQA Computer Science A-Level|Topics aligned to Specification/.test(networkConfigurationSource)) {
  failures.push('network_configuration.html: its redundant page-specific footer must remain removed');
}

const networkDecisionsSource = fs.readFileSync(path.join(root, 'network_decisions.html'), 'utf8');
if (/Solution Required|OK, Continue|fixed inset-0 bg-black bg-opacity-50/.test(networkDecisionsSource)
  || !/status === "revealed"[\s\S]{0,1400}<h3[^>]*>Solution<\/h3>[\s\S]{0,1400}onClick=\{onCorrect\}[\s\S]{0,400}Next Step/.test(networkDecisionsSource)
  || /setTimeout\(\(\)\s*=>\s*\{[\s\S]{0,240}onCorrect\(\)/.test(networkDecisionsSource)
  || !/status === "correct"[\s\S]{0,1400}onClick=\{onCorrect\}[\s\S]{0,400}Next Step/.test(networkDecisionsSource)) {
  failures.push('network_decisions.html: correct and revealed answers must remain inline until the learner selects Next Step');
}
const vonNeumannSource = fs.readFileSync(path.join(root, 'von_neumann_architecture.html'), 'utf8');
if (/von-neumann-simulator[^"']*\bh-screen\b/.test(vonNeumannSource)
  || !/overflow-y\s*:\s*auto/.test(vonNeumannSource)
  || !/processor-layout/.test(vonNeumannSource)) {
  failures.push('von_neumann_architecture.html: processor content must use natural height with a vertical page scrollbar fallback');
}
if (!/cpu-top-row flex justify-between min-h-\[13rem\] gap-6/.test(vonNeumannSource)
  || !/\.cpu-top-row\s*\{[\s\S]*?height:\s*auto[\s\S]*?align-items:\s*stretch/.test(vonNeumannSource)) {
  failures.push('von_neumann_architecture.html: the CU/ALU row must expand for the active decoder without obscuring the Control Unit border');
}
const dijkstraSource = fs.readFileSync(path.join(root, 'dijkstra.html'), 'utf8');
if (/group-hover:block/.test(dijkstraSource)
  || !/const \[isDifficultyFilterOpen, setIsDifficultyFilterOpen\] = useState\(false\)/.test(dijkstraSource)
  || !/onClick=\{\(\) => setIsDifficultyFilterOpen\(\(isOpen\) => !isOpen\)\}/.test(dijkstraSource)
  || !/\{isDifficultyFilterOpen && \(/.test(dijkstraSource)) {
  failures.push('dijkstra.html: the difficulty filter must open on click and remain open without hover');
}
if (/\.dropdown:hover \.dropdown-content/.test(searchingSortingSource)
  || !/const \[isTopicFilterOpen, setIsTopicFilterOpen\] = useState\(false\)/.test(searchingSortingSource)
  || !/onClick=\{\(\) => setIsTopicFilterOpen\(\(isOpen\) => !isOpen\)\}/.test(searchingSortingSource)
  || !/\{isTopicFilterOpen && \(/.test(searchingSortingSource)) {
  failures.push('searching_and_sorting.html: the topic filter must open on click and remain open without hover');
}
if (!/const \[currentOracleIdx, setCurrentOracleIdx\] = useState\(0\)/.test(dijkstraSource)
  || !/const oRow = oracle\[currentOracleIdx\]/.test(dijkstraSource)
  || !/newTable\.push\(\{\s*visited: "-",\s*q: "",\s*dist: \{ \.\.\.completedDist \},\s*prev: \{ \.\.\.completedPrev \},\s*\}\);[\s\S]*?setCurrentRowIdx\(currentRowIdx \+ 1\);\s*setPhase\("UPDATE_PQ"\)/.test(dijkstraSource)
  || !/setCurrentOracleIdx\(currentOracleIdx \+ 1\)/.test(dijkstraSource)
  || !/autoFocus=\{phase === "UPDATE_PQ"\}/.test(dijkstraSource)) {
  failures.push('dijkstra.html: UPDATE PriorityQueue must open a separate editable trace row while keeping its oracle step aligned');
}
const sqlPracticeSource = fs.readFileSync(path.join(root, 'sql_practice.html'), 'utf8');
if ((sqlPracticeSource.match(/max-w-\[96rem\]/g) || []).length < 2
  || (sqlPracticeSource.match(/lg:col-span-6/g) || []).length < 2
  || !/whitespace-nowrap/.test(sqlPracticeSource)) {
  failures.push('sql_practice.html: the schema and query must share the widened desktop layout without clipping table columns');
}
if (/\balert\s*\(/.test(sqlPracticeSource)
  || !/id="sql-input-error"[\s\S]{0,500}Please attempt writing an SQL query first/.test(sqlPracticeSource)
  || !/state\.inputError\s*=\s*true[\s\S]{0,200}render\(\)/.test(sqlPracticeSource)) {
  failures.push('sql_practice.html: an empty query must show inline feedback instead of a JavaScript alert');
}
const systemDesignSource = fs.readFileSync(path.join(root, 'system_design.html'), 'utf8');
if (/className="absolute top-4 right-4 z-50"/.test(systemDesignSource)
  || !/className="relative z-50"/.test(systemDesignSource)) {
  failures.push('system_design.html: its authored filter must anchor inside the interactive title controls');
}
if (/\(!feedback\s*\|\|\s*feedback\s*===\s*"wrong"\)\s*&&\s*!showSolution/.test(systemDesignSource)
  || !/\{feedback\s*===\s*"wrong"\s*&&\s*\(/.test(systemDesignSource)
  || !/<h2[^>]*>\s*\{currentQ\.topic\}\s*<\/h2>/.test(systemDesignSource)) {
  failures.push('system_design.html: the topic must title the content card and Show Solution must require an incorrect attempt');
}
const callStackSource = fs.readFileSync(path.join(root, 'recursion_and_the_call_stack.html'), 'utf8');
const callStackPseudocode = callStackSource.slice(
  callStackSource.indexOf('const renderPseudocode'),
  callStackSource.indexOf('const renderStackFrames'),
);
if (!/bg-amber-100 dark:bg-amber-900\/40 ring-1 ring-amber-300 dark:ring-amber-600/.test(callStackPseudocode)
  || /bg-slate-700 border-l-4 border-yellow-400/.test(callStackPseudocode)
  || /name="arrow-left"/.test(callStackPseudocode)) {
  failures.push('recursion_and_the_call_stack.html: the current pseudocode line must use the stable light/dark amber highlight without an arrow');
}

// Advanced mode must carry the journey past transmission: an independent
// routing decision per packet, out-of-order arrival with the incomplete
// sequence held at the transport layer, then reassembly and delivery. Basic
// mode must stop at the transmission medium, and switching mode must restart.
const tcpIpSource = fs.readFileSync(path.join(root, 'tcp_ip_layer.html'), 'utf8');
if (!/function getSteps\(\)[\s\S]{0,320}isAdvanced\(\)[\s\S]{0,320}routerStep\(0[\s\S]{0,120}routerStep\(1[\s\S]{0,120}arrivalStep\(0[\s\S]{0,120}arrivalStep\(1[\s\S]{0,120}deliveryStep/.test(tcpIpSource)
  || !/function setDetailMode\([\s\S]{0,600}currentStepIndex = 0;\s*\n\s*renderStep\(\);/.test(tcpIpSource)
  || !/applyRouterHop[\s\S]{0,400}ttlAtRouter = segment\.ttl - 1/.test(tcpIpSource)
  || !/const ARRIVAL_ORDER = \[1, 0\]/.test(tcpIpSource)
  || !/HELD: this is Seq \$\{seg\.sequenceNumber\}/.test(tcpIpSource)) {
  failures.push('tcp_ip_layer.html: advanced mode must add per-packet router hops with TTL, out-of-order arrival held at the transport layer, and reassembly, and changing mode must restart the journey');
}
const tcpIpTrailer = tcpIpSource.slice(
  tcpIpSource.indexOf('function trailerText'),
  tcpIpSource.indexOf('function appLayerBlock'),
);
if (!/isAdvanced\(\)/.test(tcpIpTrailer)
  || !/CRC checksum: \$\{checksum\}/.test(tcpIpTrailer)
  || !/ephemeral port/.test(tcpIpSource)) {
  failures.push('tcp_ip_layer.html: advanced mode must label the frame trailer as a CRC checksum and explain the ephemeral source port');
}

// Application layer protocol simulators (AQA 4.9.4.2). Each page is a guided
// two-view simulator; the suite grows one page at a time, so pages that do
// not exist yet are skipped rather than failing.
const protocolLabPages = [
  'http_https_simulator.html',
  'dns_simulator.html',
  'email_smtp_pop3_simulator.html',
  'ftp_simulator.html',
  'ssh_simulator.html',
];
const protocolLabDeviation = 'That is not the action for this step. Follow the simulation instructions exactly — enter the command shown in the instruction panel.';

protocolLabPages.forEach((page) => {
  const pagePath = path.join(root, page);
  if (!fs.existsSync(pagePath)) return;
  const source = fs.readFileSync(pagePath, 'utf8');

  if (!source.includes(protocolLabDeviation)) {
    failures.push(`${page}: the shared deviation message must be identical across the protocol simulators`);
  }

  // The site bar is 58px, so the viewport-locked layout must subtract it, and
  // must only apply once the two columns sit side by side.
  if (!/\.protocol-lab\s*\{[^}]*height:\s*100vh/.test(source)
    || !/body\[data-site-page="interactive"\]\s*\.protocol-lab\s*\{[^}]*height:\s*calc\(100vh - 58px\)/.test(source)
    || !/@media \(min-width: 1024px\)/.test(source)
    || /protocol-lab[^"']*\bh-screen\b/.test(source)) {
    failures.push(`${page}: the app root must subtract the built site bar and lock to the viewport only at the two-column breakpoint`);
  }

  // Both views of the same protocol must stay available and announced.
  if (!/aria-pressed=\{view === "app"\}/.test(source)
    || !/aria-pressed=\{view === "terminal"\}/.test(source)
    || !/>\s*Application\s*</.test(source)
    || !/>\s*Terminal\s*</.test(source)) {
    failures.push(`${page}: the Application and Terminal view toggle must be present with aria-pressed state`);
  }

  // A placeholder is a hint, not a label.
  if (!/htmlFor="terminal-input"/.test(source) || !/id="terminal-input"/.test(source)) {
    failures.push(`${page}: the terminal command input must have a visible associated label`);
  }

  // Enter must submit; implicit form submission alone is not relied on.
  if (!/event\.key === "Enter"/.test(source)) {
    failures.push(`${page}: pressing Enter in the command input must submit it for keyboard users`);
  }

  if (/\balert\s*\(/.test(source)) {
    failures.push(`${page}: feedback must be inline, not a JavaScript alert`);
  }

  // Documentation-only names and addresses (RFC 2606 / RFC 5737), so nothing
  // in these pages can point at a real host.
  const domains = source.match(/\b[a-z0-9-]+\.(?:com|net|org|uk|io|co\.uk)\b/gi) || [];
  const allowedHosts = new Set(['googletagmanager.com', 'tailwindcss.com', 'unpkg.com']);
  const badDomain = domains.find((domain) => {
    const lower = domain.toLowerCase();
    return !allowedHosts.has(lower) && !/^example\.(com|net|org)$/.test(lower);
  });
  if (badDomain) {
    failures.push(`${page}: use only RFC 2606 documentation domains (example.com/.net/.org), found "${badDomain}"`);
  }
  const addresses = source.match(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g) || [];
  const badAddress = addresses.find((address) => !/^(?:192\.0\.2\.|198\.51\.100\.|203\.0\.113\.)/.test(address));
  if (badAddress) {
    failures.push(`${page}: use only RFC 5737 documentation IP ranges, found "${badAddress}"`);
  }
});

// The SSH page exists to correct the "SSH is just logging in" misconception,
// so it must actually execute an administrative command and show the wire.
const sshSimulatorPath = path.join(root, 'ssh_simulator.html');
if (fs.existsSync(sshSimulatorPath)) {
  const sshSimulatorSource = fs.readFileSync(sshSimulatorPath, 'utf8');
  if (!/systemctl restart webserver/.test(sshSimulatorSource)
    || !/Show what the two ends see/.test(sshSimulatorSource)) {
    failures.push('ssh_simulator.html: must include a remote administrative command and the encrypted/plaintext wire toggle');
  }
}

if (failures.length > 0) {
  console.error('Interactive consistency validation failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`Validated shared UI consistency and first-letter placeholders across ${files.length} page(s).`);
