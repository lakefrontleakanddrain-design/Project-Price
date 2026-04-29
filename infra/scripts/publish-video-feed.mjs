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
const coreHashtags = [
  '#ProjectPrice',
  '#AIEstimate',
  '#RealEstateTools',
  '#ConstructionCost',
];

const topicHashtagRules = [
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

const adHookTemplates = [
  (title) => `Buyer warning: ${title} can blow up a deal fast.`,
  (title) => `Before you buy: ${title} can wreck your budget quickly.`,
  (title) => `Deal alert: ${title} is where buyers often overpay.`,
  (title) => `Quick reality check: ${title} can cost more than expected.`,
  (title) => `House-hunting tip: factor ${title} in before making your offer.`,
];

const pickHookTemplateIndex = (text) => {
  const key = toSingleLine(text);
  let hash = 0;
  for (const ch of key) hash = (hash * 31 + ch.charCodeAt(0)) % 1000003;
  return hash % adHookTemplates.length;
};

const buildHashtagSuffix = (text) => {
  const selected = [...coreHashtags];
  const sourceText = toSingleLine(text);
  for (const rule of topicHashtagRules) {
    if (rule.test.test(sourceText) && !selected.includes(rule.tag)) {
      selected.push(rule.tag);
    }
    if (selected.length >= 7) break;
  }
  return selected.join(' ');
};

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

const getVideoByteLength = (videoPath) => {
  try {
    const normalized = String(videoPath || '').replace(/^\/+/, '');
    const absolutePath = path.join(publicDir, normalized);
    return fs.statSync(absolutePath).size;
  } catch {
    return 0;
  }
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

const looksLegacyTitle = (title) => toSingleLine(title).includes(' | ');

const normalizeLegacyTitle = (title) => {
  const clean = toSingleLine(title);
  if (!looksLegacyTitle(clean)) return clean;
  const [hookSegment, detailSegment] = clean.split('|').map((segment) => segment.trim());
  const hook = hookSegment.replace(/\s+scenario$/i, '').trim();
  if (!hook || !detailSegment) return clean;
  return truncateWithEllipsis(`${hook}: ${detailSegment}`, 120);
};

const looksLegacyDescription = (description) => toSingleLine(description).startsWith('Project Price short-form video:');
const looksGeneratedAdDescription = (description) => toSingleLine(description).startsWith('Buyer warning:');

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
  const cleanTitle = toSingleLine(title);
  const hook = adHookTemplates[pickHookTemplateIndex(cleanTitle)](cleanTitle);
  const hashtagSuffix = buildHashtagSuffix(title);
  const prefix = `${hook} Use Project Price to compare repair costs, negotiate smarter, and stop overpaying.`;
  const reservedLength = hashtagSuffix.length + 1;
  const bodyMaxChars = Math.max(0, 300 - reservedLength);
  return `${truncateWithEllipsis(prefix, bodyMaxChars)} ${hashtagSuffix}`.trim();
};

const buildVideoPage = (item) => {
  const title = escapeHtml(item.title);
  const desc = escapeHtml(item.description);
  const videoSrc = escapeHtml(item.videoPath);
  const pageUrl = `${siteBaseUrl}${item.pagePath}`;
  const directVideoUrl = `${siteBaseUrl}${item.videoPath}`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <link rel="icon" type="image/jpeg" href="/logo.jpg" />
  <link rel="shortcut icon" type="image/jpeg" href="/logo.jpg" />
  <link rel="apple-touch-icon" href="/logo.jpg" />
  <link rel="canonical" href="${escapeHtml(pageUrl)}" />
  <title>${title} | ProjectPrice Video</title>
  <meta name="description" content="${desc}" />
  <meta property="og:type" content="video.other" />
  <meta property="og:title" content="${title}" />
  <meta property="og:description" content="${desc}" />
  <meta property="og:url" content="${escapeHtml(pageUrl)}" />
  <meta property="og:video" content="${escapeHtml(directVideoUrl)}" />
  <meta property="og:video:secure_url" content="${escapeHtml(directVideoUrl)}" />
  <meta property="og:video:type" content="video/mp4" />
  <meta property="og:video:width" content="1080" />
  <meta property="og:video:height" content="1920" />
  <meta name="twitter:card" content="summary" />
  <meta name="twitter:title" content="${title}" />
  <meta name="twitter:description" content="${desc}" />
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
    .brand-bar {
      max-width: 900px;
      margin: 0 auto 18px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 4px;
    }
    .brand-logo { display: flex; align-items: center; gap: 10px; text-decoration: none; }
    .brand-nav { display: flex; gap: 16px; }
    .brand-nav a {
      color: #4a6a8a;
      text-decoration: none;
      font-size: .85rem;
      font-weight: 600;
    }
    .brand-nav a:hover { color: var(--navy); }
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
    .links { margin-top: 12px; display: flex; gap: 12px; flex-wrap: wrap; }
    .links a { color: var(--navy); font-weight: 700; text-decoration: none; font-size: .88rem; }
    .links a:hover { text-decoration: underline; }
    .footer {
      margin-top: 40px;
      padding: 20px 4px;
      border-top: 1px solid #d3e2f5;
      text-align: center;
      font-size: .8rem;
      color: #7a99b8;
    }
    .footer a {
      color: #446684;
      text-decoration: none;
      font-weight: 700;
      margin: 0 8px;
    }
    .footer a:hover { color: var(--navy); }
  </style>
</head>
<body>
  <header class="brand-bar">
    <a href="/" class="brand-logo" style="font-weight:800;color:var(--navy);">ProjectPrice</a>
    <nav class="brand-nav">
      <a href="/get-quotes.html">Request Estimate</a>
      <a href="/my-estimates.html">My Saved Projects</a>
      <a href="/contractor-signup.html">For Contractors</a>
      <a href="/contractor-portal.html">Contractor Login</a>
    </nav>
  </header>
  <div class="wrap">
    <div class="card">
      <h1>${title}</h1>
      <p>${desc}</p>
      <video controls playsinline preload="metadata" src="${videoSrc}"></video>
      <div class="links">
        <a href="${escapeHtml(directVideoUrl)}">Direct Video Link</a>
        <a href="${escapeHtml(pageUrl)}">Share This Page</a>
      </div>
      <p class="meta">Published ${escapeHtml(formatDisplayDate(item.publishedAt))}</p>
    </div>
    <footer class="footer">
      <p style="margin:0 0 6px;">
        <a href="/privacy-policy.html">Privacy Policy</a>
        <a href="/data-deletion.html">Data Deletion</a>
        <a href="/admin.html">Admin</a>
        <a href="/">Home</a>
      </p>
      <p style="margin:0;">&copy; 2026 ProjectPrice. All rights reserved.</p>
    </footer>
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
    const directVideoUrl = `${siteBaseUrl}${item.videoPath}`;
    const published = escapeHtml(formatDisplayDate(item.publishedAt));

    return `<article class="item">
      <h3><a href="${pageUrl}">${title}</a></h3>
      <p>${desc}</p>
      <video controls playsinline preload="metadata" src="${videoPath}"></video>
      <p class="video-link"><a href="${escapeHtml(directVideoUrl)}">Direct Video Link</a></p>
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
    .brand-bar {
      max-width: 1100px;
      margin: 0 auto 18px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 4px;
    }
    .brand-logo { display: flex; align-items: center; gap: 10px; text-decoration: none; }
    .brand-nav { display: flex; gap: 16px; }
    .brand-nav a {
      color: #4a6a8a;
      text-decoration: none;
      font-size: .85rem;
      font-weight: 600;
    }
    .brand-nav a:hover { color: var(--navy); }
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
    .video-link { margin: 10px 0 0; }
    .video-link a { color: var(--navy); font-weight: 700; text-decoration: none; font-size: .88rem; }
    .video-link a:hover { text-decoration: underline; }
    video { width:100%; border-radius:10px; border:1px solid var(--line); background:#000; }
    .meta { margin-top:8px; color:#6b87a5; font-size:.8rem; }
    .rss { margin-top: 12px; font-size: .88rem; color: #4a6a8a; }
    .rss code { background:#f5f9ff; border:1px solid #d8e6f8; padding:2px 6px; border-radius:8px; }
    .footer {
      margin-top: 40px;
      padding: 20px 4px;
      border-top: 1px solid #d3e2f5;
      text-align: center;
      font-size: .8rem;
      color: #7a99b8;
    }
    .footer a {
      color: #446684;
      text-decoration: none;
      font-weight: 700;
      margin: 0 8px;
    }
    .footer a:hover { color: var(--navy); }
  </style>
</head>
<body>
  <header class="brand-bar">
    <a href="/" class="brand-logo">
      <img src="/logo.jpg" alt="ProjectPrice" style="height:44px;width:auto;" />
    </a>
    <nav class="brand-nav">
      <a href="/get-quotes.html">Request Estimate</a>
      <a href="/my-estimates.html">My Saved Projects</a>
      <a href="/contractor-signup.html">For Contractors</a>
      <a href="/contractor-portal.html">Contractor Login</a>
    </nav>
  </header>
  <div class="wrap">
    <section class="hero">
      <h1>ProjectPrice Live Video Feed</h1>
    </section>
    <section class="grid">
      ${cards || '<article class="item"><h3>No videos published yet</h3><p>Run the publish script after generating a new video to create feed entries.</p></article>'}
    </section>
    <footer class="footer">
      <p style="margin:0 0 6px;">
        <a href="/privacy-policy.html">Privacy Policy</a>
        <a href="/data-deletion.html">Data Deletion</a>
        <a href="/admin.html">Admin</a>
        <a href="/">Home</a>
      </p>
      <p style="margin:0;">&copy; 2026 ProjectPrice. All rights reserved.</p>
    </footer>
  </div>
</body>
</html>
`;
};

const buildRss = (items, channelTitle, channelPath) => {
  const channelLink = `${siteBaseUrl}${channelPath}`;
  const now = new Date();
  const pubDate = now.toUTCString();

  const itemXml = items.slice(0, 1).map((item) => {
    const link = `${siteBaseUrl}${item.pagePath}`;
    const videoUrl = `${siteBaseUrl}${item.videoPath}`;
    const videoSize = getVideoByteLength(item.videoPath);
    const itemPubDate = new Date(item.publishedAt).toUTCString();
    const contentHtml = `<p>${escapeXml(item.title)}</p><p>${escapeXml(item.description)}</p><p><a href="${escapeXml(link)}">Watch on Project Price</a></p><video controls preload="metadata" playsinline style="max-width:100%;height:auto;"><source src="${escapeXml(videoUrl)}" type="video/mp4"></video>`;
    
    return `    <item>
    <title><![CDATA[${item.title}]]></title>
    <link>${escapeXml(link)}</link>
    <dc:creator><![CDATA[projectprice]]></dc:creator>
    <guid isPermaLink="false">${escapeXml(item.guid)}</guid>
    <pubDate>${itemPubDate}</pubDate>
    <description><![CDATA[${item.description}]]></description>
    <content:encoded><![CDATA[${contentHtml}]]></content:encoded>
    <enclosure url="${escapeXml(videoUrl)}" length="${videoSize}" type="video/mp4" />
    <media:content url="${escapeXml(videoUrl)}" fileSize="${videoSize}" medium="video" type="video/mp4" />
    </item>`;
  }).join('\n\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
    xmlns:excerpt="http://wordpress.org/export/1.2/excerpt/"
    xmlns:content="http://purl.org/rss/1.0/modules/content/"
    xmlns:wfw="http://wellformedweb.org/CommentAPI/"
    xmlns:dc="http://purl.org/dc/elements/1.1/"
    xmlns:wp="http://wordpress.org/export/1.2/"
    xmlns:media="http://search.yahoo.com/mrss/"
>

<channel>
    <title>PROJECT PRICE LIVE VIDEO</title>
    <link>${escapeXml(channelLink)}</link>
    <description>Realtor and Homebuyer Property Estimate Strategy Videos</description>
    <language>en</language>
    <pubDate>${pubDate}</pubDate>
    <wp:wxr_version>1.2</wp:wxr_version>
    <wp:base_site_url>${escapeXml(siteBaseUrl)}/</wp:base_site_url>
    <wp:base_blog_url>${escapeXml(siteBaseUrl)}</wp:base_blog_url>

    <generator>http://wordpress.com/</generator>

${itemXml}

</channel>
</rss>
`;
};

const buildMetricoolRss = (items) => {
  const now = new Date();
  const pubDate = now.toUTCString();

  const itemXml = items.slice(0, 1).map((item) => {
    const link = `${siteBaseUrl}${item.videoPath}`;
    const videoUrl = `${siteBaseUrl}${item.videoPath}`;
    const videoSize = getVideoByteLength(item.videoPath);
    const contentHtml = `<video controls><source src="${escapeXml(videoUrl)}" type="video/mp4" /></video>`;
    
    return `    <item>
    <title>${escapeXml(item.title)}</title>
    <link>${escapeXml(link)}</link>
    <description>${escapeXml(item.description)}</description>
    <enclosure url="${escapeXml(videoUrl)}" length="${videoSize}" type="video/mp4" />
    <media:content url="${escapeXml(videoUrl)}" type="video/mp4" />
    <content:encoded><![CDATA[${contentHtml}]]></content:encoded>
    </item>`;
  }).join('\n\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
    xmlns:content="http://purl.org/rss/1.0/modules/content/"
    xmlns:media="http://search.yahoo.com/mrss/"
>

<channel>
    <title>PROJECT PRICE LIVE VIDEO</title>
    <link>${escapeXml(siteBaseUrl)}</link>
    <description>Realtor and Homebuyer Property Estimate Strategy Videos</description>
    <pubDate>${pubDate}</pubDate>
    <language>en</language>
    <generator>http://wordpress.com/</generator>

${itemXml}

</channel>
</rss>
`;
};

const writeText = (filePath, content) => fs.writeFileSync(filePath, content, 'utf8');

const loadManifest = () => {
  const data = readJson(manifestPath, { version: 1, items: [] });
  const items = Array.isArray(data?.items)
    ? data.items.map((item) => {
      const normalizedTitle = normalizeLegacyTitle(item?.title || '');
      const nextDescription = (looksLegacyDescription(item?.description || '') || looksGeneratedAdDescription(item?.description || ''))
        ? buildDefaultDescription(normalizedTitle)
        : item?.description;

      return {
        ...item,
        title: normalizedTitle || item?.title,
        description: nextDescription || item?.description,
      };
    })
    : [];
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
  const description = toSingleLine(descriptionArg || buildDefaultDescription(title));
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

  // Keep every generated item page in sync with current shared template updates.
  manifest.items.forEach((item) => {
    writeText(path.join(liveVideoDir, `${item.slug}.html`), buildVideoPage(item));
  });

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
