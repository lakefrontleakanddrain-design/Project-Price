import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);

const readArg = (name, fallback = null) => {
  const prefix = `--${name}=`;
  const found = args.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
};

const input = readArg('input');
if (!input) {
  throw new Error('Missing required --input=<video-file> argument.');
}

const resolvedInput = path.resolve(input);
if (!fs.existsSync(resolvedInput)) {
  throw new Error(`Input file not found: ${resolvedInput}`);
}

const outputDir = path.resolve(readArg('output-dir', path.join(process.cwd(), 'infra', 'video', 'output')));
const maxSeconds = Number.parseFloat(readArg('max-seconds', '8'));
const safeMaxSeconds = Number.isFinite(maxSeconds) && maxSeconds > 0 ? maxSeconds : 8;

fs.mkdirSync(outputDir, { recursive: true });

const ensureBinary = (name) => {
  const check = spawnSync(name, ['-version'], { stdio: 'ignore' });
  if (check.status !== 0) {
    throw new Error(`${name} is required but was not found in PATH.`);
  }
};

ensureBinary('ffmpeg');

const platforms = [
  {
    id: 'instagram',
    filename: 'instagram-reels-1080x1920.mp4',
    videoBitrate: '8M',
  },
  {
    id: 'tiktok',
    filename: 'tiktok-1080x1920.mp4',
    videoBitrate: '8M',
  },
  {
    id: 'youtube',
    filename: 'youtube-shorts-1080x1920.mp4',
    videoBitrate: '10M',
  },
];

const filter = [
  'scale=1080:1920:force_original_aspect_ratio=decrease',
  'pad=1080:1920:(ow-iw)/2:(oh-ih)/2',
  'format=yuv420p',
].join(',');

const outputs = [];

for (const platform of platforms) {
  const outPath = path.join(outputDir, platform.filename);
  const ffmpegArgs = [
    '-y',
    '-i',
    resolvedInput,
    '-t',
    String(safeMaxSeconds),
    '-map',
    '0:v:0',
    '-map',
    '0:a:0?',
    '-vf',
    filter,
    '-r',
    '30',
    '-c:v',
    'libx264',
    '-preset',
    'medium',
    '-profile:v',
    'high',
    '-level',
    '4.1',
    '-pix_fmt',
    'yuv420p',
    '-b:v',
    platform.videoBitrate,
    '-maxrate',
    platform.videoBitrate,
    '-bufsize',
    '16M',
    '-c:a',
    'aac',
    '-b:a',
    '128k',
    '-ar',
    '48000',
    '-movflags',
    '+faststart',
    outPath,
  ];

  const run = spawnSync('ffmpeg', ffmpegArgs, { stdio: 'inherit' });
  if (run.status !== 0) {
    throw new Error(`ffmpeg failed for ${platform.id} output.`);
  }

  outputs.push({
    platform: platform.id,
    file: outPath,
    width: 1080,
    height: 1920,
    fps: 30,
    maxSeconds: safeMaxSeconds,
  });
}

console.log(JSON.stringify({ input: resolvedInput, outputDir, outputs }, null, 2));
