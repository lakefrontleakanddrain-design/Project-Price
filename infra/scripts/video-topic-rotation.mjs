import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();

const defaultTopicsPath = path.join(repoRoot, 'infra', 'video', 'topic-rotation.json');
const defaultStatePath = path.join(repoRoot, 'infra', 'video', 'topic-rotation-state.json');

const args = process.argv.slice(2);

const readArg = (name, fallback = null) => {
  const prefix = `--${name}=`;
  const found = args.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
};

const topicsPath = path.resolve(readArg('topics', defaultTopicsPath));
const statePath = path.resolve(readArg('state', defaultStatePath));
const dryRun = args.includes('--dry-run');
const cliMaxTopicChars = Number.parseInt(readArg('max-topic-chars', ''), 10);

const readJson = (filePath) => {
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
};

const writeJson = (filePath, value) => {
  const text = `${JSON.stringify(value, null, 2)}\n`;
  fs.writeFileSync(filePath, text, 'utf8');
};

const ensureState = (state) => {
  const nextIndex = Number.isInteger(state?.nextIndex) ? state.nextIndex : 0;
  return {
    version: 1,
    nextIndex,
    lastTopicId: state?.lastTopicId || null,
    lastRunAt: state?.lastRunAt || null,
  };
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const toSingleLine = (value) => String(value || '').replace(/\s+/g, ' ').trim();

const truncateWithEllipsis = (text, maxChars) => {
  const clean = toSingleLine(text);
  if (clean.length <= maxChars) return clean;
  if (maxChars <= 3) return clean.slice(0, maxChars);
  return `${clean.slice(0, maxChars - 3).trimEnd()}...`;
};

const CORE_HASHTAGS = [
  '#ProjectPrice',
  '#AIEstimate',
  '#RealEstateTools',
  '#ConstructionCost',
];

const TOPIC_HASHTAG_RULES = [
  { test: /buyer|starter/i, tag: '#FirstTimeHomeBuyer' },
  { test: /home|buyer|hunting|listing/i, tag: '#HouseHunting' },
  { test: /repair|roof|foundation|wiring|panel|hvac/i, tag: '#HomeRepair' },
  { test: /budget|cost|credit|offer|overpaying/i, tag: '#StopOverpaying' },
  { test: /budget|refresh|phased|remodel/i, tag: '#RemodelBudget' },
  { test: /smart|strategy|realtor|estimate/i, tag: '#SmartHomeowner' },
  { test: /project price|ai|estimate/i, tag: '#PropTech' },
  { test: /improvement|refresh|repair|replacement/i, tag: '#HomeImprovement' },
  { test: /hack|save|strategy/i, tag: '#LifeHacks' },
];

const buildHashtagSuffix = (topic) => {
  const sourceText = [
    topic?.pivot,
    topic?.propertyType,
    topic?.repairFocus,
    topic?.decisionType,
    topic?.pov,
  ].map(toSingleLine).join(' ');

  const selected = [...CORE_HASHTAGS];
  for (const rule of TOPIC_HASHTAG_RULES) {
    if (rule.test.test(sourceText) && !selected.includes(rule.tag)) {
      selected.push(rule.tag);
    }
    if (selected.length >= 7) break;
  }

  return selected.join(' ');
};

const buildTopicTitle = (topic) => {
  const hook = toSingleLine(topic.pivot);
  const repairFocus = toSingleLine(topic.repairFocus).toLowerCase();
  const propertyType = toSingleLine(topic.propertyType).toLowerCase();
  return truncateWithEllipsis(`${hook}: ${repairFocus} in a ${propertyType}`, 120);
};

const buildTopicOutput = (topic, maxChars) => {
  const hashtagSuffix = buildHashtagSuffix(topic);
  const prefix = [
    `Buyer warning: ${toSingleLine(topic.repairFocus)} can blow up a deal fast.`,
    `Use Project Price to compare repair costs, plan a ${toSingleLine(topic.decisionType).toLowerCase()}, and stop overpaying.`,
  ].join(' ');
  const reservedLength = hashtagSuffix.length + 1;
  const bodyMaxChars = Math.max(0, maxChars - reservedLength);
  const body = truncateWithEllipsis(prefix, bodyMaxChars);
  return `${body} ${hashtagSuffix}`.trim();
};

const buildPrompt = (topic) => {
  const parts = [
    'Create a realistic 8-second social video in a residential home-buying context.',
    `Creative pivot: ${topic.pivot}.`,
    `Property type: ${topic.propertyType}.`,
    `Repair focus: ${topic.repairFocus}.`,
    `Decision type: ${topic.decisionType}.`,
    `Emotion: ${topic.emotion}.`,
    `POV: ${topic.pov}.`,
    'Show a realtor advising a buyer and using Project Price for immediate Basic, Standard, and Premium estimate ranges.',
    'End with a practical next step for offer strategy, seller credit, or repair planning.',
    'Do not promise exact final contractor bids.',
  ];
  return parts.join(' ');
};

const topicsData = readJson(topicsPath);
const topics = Array.isArray(topicsData?.topics) ? topicsData.topics : [];
const configuredMaxChars = Number.parseInt(String(topicsData?.maxTopicChars || ''), 10);
const topicMaxChars = clamp(
  Number.isInteger(cliMaxTopicChars) ? cliMaxTopicChars : configuredMaxChars || 300,
  40,
  500,
);

if (topics.length === 0) {
  throw new Error(`No topics found in ${topicsPath}`);
}

const existingState = fs.existsSync(statePath) ? readJson(statePath) : {};
const state = ensureState(existingState);

const normalizedIndex = ((state.nextIndex % topics.length) + topics.length) % topics.length;
const selected = topics[normalizedIndex];
const nextIndex = (normalizedIndex + 1) % topics.length;

const nowIso = new Date().toISOString();
const newState = {
  ...state,
  nextIndex,
  lastTopicId: selected.id || null,
  lastRunAt: nowIso,
};

if (!dryRun) {
  writeJson(statePath, newState);
}

const result = {
  selectedIndex: normalizedIndex,
  totalTopics: topics.length,
  topic: selected,
  topicTitle: buildTopicTitle(selected),
  topicOutput: buildTopicOutput(selected, topicMaxChars),
  topicOutputMaxChars: topicMaxChars,
  prompt: buildPrompt(selected),
  nextIndex,
  stateUpdated: !dryRun,
};

if (process.env.GITHUB_OUTPUT) {
  const outLines = [
    `topic_id=${String(selected.id || '')}`,
    `topic_index=${normalizedIndex}`,
    `topic_total=${topics.length}`,
    `topic_title=${result.topicTitle}`,
    `topic_output=${result.topicOutput}`,
    `topic_output_max_chars=${topicMaxChars}`,
    `topic_prompt=${JSON.stringify(result.prompt)}`,
  ];
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `${outLines.join('\n')}\n`, 'utf8');
}

console.log(JSON.stringify(result, null, 2));
