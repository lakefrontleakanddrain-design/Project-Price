import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);

const readArg = (name, fallback = null) => {
  const prefix = `--${name}=`;
  const hit = args.find((arg) => arg.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : fallback;
};

const hasFlag = (name) => args.includes(`--${name}`);

const repoRoot = process.cwd();
const manifestPath = path.join(repoRoot, 'infra', 'video', 'feed-items.json');
const publicDir = path.join(repoRoot, 'web', 'public');
const liveVideoDir = path.join(publicDir, 'live-video');
const generatedDir = path.join(liveVideoDir, 'generated');
const indexPath = path.join(liveVideoDir, 'index.html');
const rssPath = path.join(publicDir, 'live-video-feed.xml');
const metricoolPath = path.join(publicDir, 'metricool-live-video.xml');

const source = readArg('source', null);
const siteBaseUrl = String(readArg('site-base-url', 'https://projectpriceapp.com')).replace(/\/$/, '');
const titleArg = readArg('title', null);
const topicOutput = readArg('topic', null);
const descriptionArg = readArg('description', null);
const maxItemsArg = Number.parseInt(readArg('max-items', '30'), 10);
const maxItems = Number.isInteger(maxItemsArg) && maxItemsArg > 0 ? maxItemsArg : 30;
const rebuildOnly = hasFlag('rebuild-only');

const toSingleLine = (value) => String(value || '').replace(/\s+/g, ' ').trim();
const truncateWithEllipsis = (text, maxChars) => {
  const clean = toSingleLine(text);
  if (clean.length <= maxChars) return clean;
  if (maxChars <= 3) return clean.slice(0, maxChars);
  return `${clean.slice(0, maxChars - 3).trimEnd()}...`;
};

const ensureDir = (dirPath) => {
  fs.mkdirSync(dirPath, { recursive: true });
};

const readJson = (filePath, fallback) => {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
};

const writeJson = (filePath, value) => {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
};

const escapeHtml = (value) => String(value || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const escapeXml = (value) => String(value || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;');

const slugify = (value) => String(value || '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 70);

const createTimestampToken = (date) => {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  const hh = String(date.getUTCHours()).padStart(2, '0');
  const mm = String(date.getUTCMinutes()).padStart(2, '0');
  const ss = String(date.getUTCSeconds()).padStart(2, '0');
  return `${y}${m}${d}${hh}${mm}${ss}`;
};

const formatDisplayDate = (iso) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

const buildDefaultDescription = (title) => {
  return truncateWithEllipsis(
    `Project Price short-form video: ${title}. Realtor-led buyer guidance with immediate estimate ranges and repair negotiation context.`,
    280,
  );
};

const buildVideoPage = (item) => {
  const title = escapeHtml(item.title);
  const desc = escapeHtml(item.description);
  const videoSrc = escapeHtml(item.videoPath);
  const pageUrl = `${siteBaseUrl}${item.pagePath}`;
  const ogImage = `${siteBaseUrl}/logo.jpg`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <link rel="icon" type="image/jpeg" href="/logo.jpg" />
  <link rel="shortcut icon" type="image/jpeg" href="/logo.jpg" />
  <link rel="apple-touch-icon" href="/logo.jpg" />
  <title>${title} | ProjectPrice Video</title>
  <meta name="description" content="${desc}" />
  <meta property="og:type" content="article" />
  <meta property="og:title" content="${title}" />
  <meta property="og:description" content="${desc}" />
  <meta property="og:url" content="${escapeHtml(pageUrl)}" />
  <meta property="og:image" content="${escapeHtml(ogImage)}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${title}" />
  <meta name="twitter:description" content="${desc}" />
  <meta name="twitter:image" content="${escapeHtml(ogImage)}" />
  <style>
    :root { --navy:#0e3a78; --emerald:#16a36a; --line:#d3e2f5; --ink:#11365d; --paper:#fff; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Segoe UI, Arial, sans-serif;
      color: var(--ink);
      background: linear-gradient(170deg, #eaf2ff 0%, #f3f8ff 45%, #effff7 100%);
      min-height: 100vh;
      padding: 24px;
    }
    .wrap { max-width: 900px; margin: 0 auto; }
    .brand { display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; }
    .brand a { color:#4a6a8a; text-decoration:none; font-size:.85rem; font-weight:600; margin-left:14px; }
    .card {
      background: var(--paper);
      border: 1px solid var(--line);
      border-radius: 14px;
      box-shadow: 0 8px 24px rgba(0,0,0,.08);
      padding: 18px;
    }
    h1 { margin:0 0 10px; color:var(--navy); }
    p { color:#4a6a8a; line-height:1.55; }
    video { width:100%; border-radius:12px; border:1px solid var(--line); background:#000; }
    .meta { font-size:.82rem; color:#6b87a5; margin-top:10px; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="brand">
      <a href="/"><img src="/logo.jpg" alt="Project Price" style="height:44px;width:auto;" /></a>
      <nav>
        <a href="/live-video/">Live Video</a>
        <a href="/get-quotes.html">Request Estimate</a>
      </nav>
    </div>
    <div class="card">
      <h1>${title}</h1>
      <p>${desc}</p>
      <video controls playsinline preload="metadata" src="${videoSrc}"></video>
      <p class="meta">Published ${escapeHtml(formatDisplayDate(item.publishedAt))}</p>
    </div>
  </div>
</body>
</html>
`;
};

const buildIndexPage = (items) => {
  const cards = items.map((item) => {
    const title = escapeHtml(item.title);
    const desc = escapeHtml(item.description);
    const pageUrl = escapeHtml(item.pagePath);
    const videoPath = escapeHtml(item.videoPath);
    const published = escapeHtml(formatDisplayDate(item.publishedAt));

    return `<article class="item">
      <h3><a href="${pageUrl}">${title}</a></h3>
      <p>${desc}</p>
      <video controls playsinline preload="metadata" src="${videoPath}"></video>
      <div class="meta">Published ${published}</div>
    </article>`;
  }).join('\n');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <link rel="icon" type="image/jpeg" href="/logo.jpg" />
  <link rel="shortcut icon" type="image/jpeg" href="/logo.jpg" />
  <link rel="apple-touch-icon" href="/logo.jpg" />
  <title>ProjectPrice Live Video Feed</title>
  <meta name="description" content="Short-form Project Price videos for realtor-led buyer repair estimate guidance." />
  <style>
    :root { --navy:#0e3a78; --emerald:#16a36a; --line:#d3e2f5; --ink:#11365d; --paper:#fff; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Segoe UI, Arial, sans-serif;
      color: var(--ink);
      background: linear-gradient(170deg, #eaf2ff 0%, #f3f8ff 45%, #effff7 100%);
      min-height: 100vh;
      padding: 24px;
    }
    .wrap { max-width: 1100px; margin: 0 auto; }
    .brand { display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; }
    .brand a { color:#4a6a8a; text-decoration:none; font-size:.85rem; font-weight:600; margin-left:14px; }
    .hero {
      background: var(--paper);
      border: 1px solid var(--line);
      border-radius: 16px;
      box-shadow: 0 8px 24px rgba(0,0,0,.08);
      padding: 20px;
      margin-bottom: 16px;
    }
    .hero h1 { margin:0 0 8px; color:var(--navy); }
    .hero p { margin:0; color:#4a6a8a; line-height:1.55; }
    .grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(280px,1fr)); gap:14px; }
    .item {
      background: var(--paper);
      border: 1px solid var(--line);
      border-radius: 14px;
      box-shadow: 0 8px 24px rgba(0,0,0,.08);
      padding: 14px;
    }
    .item h3 { margin:0 0 8px; font-size:1rem; }
    .item h3 a { color:var(--navy); text-decoration:none; }
    .item p { margin:0 0 10px; color:#4a6a8a; font-size:.92rem; line-height:1.5; }
    video { width:100%; border-radius:10px; border:1px solid var(--line); background:#000; }
    .meta { margin-top:8px; color:#6b87a5; font-size:.8rem; }
    .rss { margin-top: 12px; font-size: .88rem; color: #4a6a8a; }
    .rss code { background:#f5f9ff; border:1px solid #d8e6f8; padding:2px 6px; border-radius:8px; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="brand">
      <a href="/"><img src="/logo.jpg" alt="Project Price" style="height:44px;width:auto;" /></a>
      <nav>
        <a href="/get-quotes.html">Request Estimate</a>
        <a href="/my-estimates.html">My Saved Projects</a>
      </nav>
    </div>
    <section class="hero">
      <h1>ProjectPrice Live Video Feed</h1>
      <p>Realtor-led buyer guidance clips generated from rotating topics. Each item includes a webpage and RSS entry for social distribution workflows.</p>
      <p class="rss">RSS for Metricool: <code>/metricool-live-video.xml</code></p>
    </section>
    <section class="grid">
      ${cards || '<article class="item"><h3>No videos published yet</h3><p>Run the publish script after generating a new video to create feed entries.</p></article>'}
    </section>
  </div>
</body>
</html>
`;
};

const buildRss = (items, channelTitle, channelPath) => {
  const channelLink = `${siteBaseUrl}${channelPath}`;
  const now = new Date().toUTCString();

  const itemXml = items.map((item) => {
    const link = `${siteBaseUrl}${item.pagePath}`;
    const enclosure = `${siteBaseUrl}${item.videoPath}`;
    return `    <item>\n      <title>${escapeXml(item.title)}</title>\n      <link>${escapeXml(link)}</link>\n      <guid isPermaLink="false">${escapeXml(item.guid)}</guid>\n      <pubDate>${new Date(item.publishedAt).toUTCString()}</pubDate>\n      <description><![CDATA[${item.description}]]></description>\n      <enclosure url="${escapeXml(enclosure)}" length="0" type="video/mp4" />\n    </item>`;
  }).join('\n\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${escapeXml(channelTitle)}</title>
    <link>${escapeXml(channelLink)}</link>
    <description>${escapeXml('Project Price rotating short-form video feed for realtor and buyer estimate strategy.')}</description>
    <language>en-us</language>
    <lastBuildDate>${now}</lastBuildDate>
${itemXml}
  </channel>
</rss>
`;
};

const buildMetricoolRss = (items) => {
  const now = new Date().toUTCString();

  const itemXml = items.map((item) => {
    const link = `${siteBaseUrl}${item.pagePath}`;
    const videoUrl = `${siteBaseUrl}${item.videoPath}`;
    return `  <item>\n    <title>${escapeXml(item.title)}</title>\n    <link>${escapeXml(link)}</link>\n    <description>${escapeXml(item.description)}</description>\n    <pubDate>${new Date(item.publishedAt).toUTCString()}</pubDate>\n    <guid>${escapeXml(link)}</guid>\n    <enclosure url="${escapeXml(videoUrl)}" length="0" type="video/mp4" />\n  </item>`;
  }).join('\n\n');

  return `<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0">
<channel>
  <title>${escapeXml('ProjectPrice Live Video Feed')}</title>
  <link>${escapeXml(siteBaseUrl)}</link>
  <description>${escapeXml('Latest updates and insights')}</description>
  <lastBuildDate>${now}</lastBuildDate>

${itemXml}
</channel>
</rss>
`;
};

const writeText = (filePath, content) => fs.writeFileSync(filePath, content, 'utf8');

const loadManifest = () => {
  const data = readJson(manifestPath, { version: 1, items: [] });
  const items = Array.isArray(data?.items) ? data.items : [];
  return { version: 1, items };
};

const saveManifest = (manifest) => writeJson(manifestPath, manifest);

const publishVideo = (manifest) => {
  if (!source) {
    throw new Error('Missing --source argument. Example: --source=infra/video/output/youtube-shorts-1080x1920.mp4');
  }

  const sourcePath = path.resolve(source);
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Source file not found: ${sourcePath}`);
  }

  const now = new Date();
  const ts = createTimestampToken(now);
  const titleCandidate = truncateWithEllipsis(titleArg || topicOutput || `Project Price Video ${ts}`, 300);
  const title = titleCandidate || `Project Price Video ${ts}`;
  const description = truncateWithEllipsis(descriptionArg || buildDefaultDescription(title), 280);
  const baseSlug = slugify(title) || `video-${ts}`;
  const slug = `${baseSlug}-${ts}`;

  ensureDir(generatedDir);
  const outputFileName = `${slug}.mp4`;
  const outputPath = path.join(generatedDir, outputFileName);
  fs.copyFileSync(sourcePath, outputPath);

  const item = {
    id: slug,
    title,
    description,
    slug,
    publishedAt: now.toISOString(),
    videoPath: `/live-video/generated/${outputFileName}`,
    pagePath: `/live-video/${slug}.html`,
    guid: `projectprice-live-video-${slug}`,
  };

  writeText(path.join(liveVideoDir, `${slug}.html`), buildVideoPage(item));
  manifest.items.unshift(item);
  manifest.items = manifest.items.slice(0, maxItems);

  return item;
};

const rebuildOutputs = (manifest) => {
  ensureDir(path.dirname(manifestPath));
  ensureDir(liveVideoDir);
  ensureDir(generatedDir);

  writeText(indexPath, buildIndexPage(manifest.items));

  const fullRss = buildRss(manifest.items, 'ProjectPrice Live Video Feed', '/live-video/');
  writeText(rssPath, fullRss);

  const metricoolRss = buildMetricoolRss(manifest.items.slice(0, 20));
  writeText(metricoolPath, metricoolRss);
};

const manifest = loadManifest();
let publishedItem = null;
if (!rebuildOnly) {
  publishedItem = publishVideo(manifest);
}
saveManifest(manifest);
rebuildOutputs(manifest);

console.log(JSON.stringify({
  published: Boolean(publishedItem),
  item: publishedItem,
  totalItems: manifest.items.length,
  indexPath,
  rssPath,
  metricoolPath,
  siteBaseUrl,
}, null, 2));
