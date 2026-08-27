'use strict';

const fs = require('fs');
const path = require('path');
const { createDashboardSnapshot } = require('./dashboard');
const { getRecentContentUpdates } = require('./repository-data');

function xmlEscape(input) {
  return String(input)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function toGitHubUrl(file) {
  return `https://github.com/jpaul11-code/PANORAFUS/blob/main/${file}`;
}

function createSyndicationSnapshot(repoRoot) {
  const dashboard = createDashboardSnapshot(repoRoot);
  const updates = getRecentContentUpdates(repoRoot, 12);

  return {
    generatedAt: dashboard.generatedAt,
    dashboard,
    items: updates.map((item) => ({
      title: item.title,
      summary: item.summary,
      file: item.file,
      committedAt: item.committedAt,
      url: toGitHubUrl(item.file),
      sha: item.sha
    }))
  };
}

function createJsonFeed(snapshot) {
  return JSON.stringify({
    version: 'https://jsonfeed.org/version/1.1',
    title: 'PANORAFUS.AI Content Syndication Feed',
    home_page_url: 'https://www.seasonedchristianministrychurch.com',
    feed_url: 'https://www.seasonedchristianministrychurch.com/panorafus/syndication/feed.json',
    description: 'Repository-backed PANORAFUS.AI content and metrics updates.',
    items: snapshot.items.map((item) => ({
      id: `${item.file}:${item.sha}`,
      url: item.url,
      title: item.title,
      summary: item.summary,
      date_published: item.committedAt
    }))
  }, null, 2);
}

function createRssFeed(snapshot) {
  const items = snapshot.items.map((item) => `
    <item>
      <title>${xmlEscape(item.title)}</title>
      <link>${xmlEscape(item.url)}</link>
      <guid>${xmlEscape(`${item.file}:${item.sha}`)}</guid>
      <pubDate>${new Date(item.committedAt).toUTCString()}</pubDate>
      <description>${xmlEscape(item.summary)}</description>
    </item>`).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>PANORAFUS.AI Content Syndication Feed</title>
    <link>https://www.seasonedchristianministrychurch.com</link>
    <description>Repository-backed PANORAFUS.AI content and metrics updates.</description>
    <lastBuildDate>${new Date(snapshot.generatedAt).toUTCString()}</lastBuildDate>
${items}
  </channel>
</rss>
`;
}

function createEmailDigest(snapshot) {
  return `# PANORAFUS.AI Weekly Content Digest

Generated at: ${snapshot.generatedAt}

## Dashboard Summary

- Documentation files tracked: ${snapshot.dashboard.kpis.documentationFiles}
- Workflow automations tracked: ${snapshot.dashboard.kpis.workflows}
- Institutions indexed: ${snapshot.dashboard.kpis.institutionsIndexed}

## Recent Content Updates

${snapshot.items.map((item) => `- **${item.title}** — ${item.summary} ([source](${item.url}))`).join('\n')}
`;
}

function ensureDir(directory) {
  fs.mkdirSync(directory, { recursive: true });
}

function writeSyndicationArtifacts(repoRoot, outputDir) {
  const root = path.resolve(repoRoot || path.resolve(__dirname, '..'));
  const targetDir = path.resolve(outputDir || path.join(root, 'public', 'syndication'));
  const snapshot = createSyndicationSnapshot(root);
  ensureDir(targetDir);
  fs.writeFileSync(path.join(targetDir, 'feed.json'), createJsonFeed(snapshot));
  fs.writeFileSync(path.join(targetDir, 'feed.xml'), createRssFeed(snapshot));
  fs.writeFileSync(path.join(targetDir, 'email-digest.md'), createEmailDigest(snapshot));
  return snapshot;
}

module.exports = {
  createSyndicationSnapshot,
  writeSyndicationArtifacts
};
