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
  prompt: buildPrompt(selected),
  nextIndex,
  stateUpdated: !dryRun,
};

if (process.env.GITHUB_OUTPUT) {
  const outLines = [
    `topic_id=${String(selected.id || '')}`,
    `topic_index=${normalizedIndex}`,
    `topic_total=${topics.length}`,
    `topic_prompt=${JSON.stringify(result.prompt)}`,
  ];
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `${outLines.join('\n')}\n`, 'utf8');
}

console.log(JSON.stringify(result, null, 2));
