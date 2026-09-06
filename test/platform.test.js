'use strict';

const fs = require('node:fs');
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const {
  extractDocumentSummary,
  getInstitutionIndex,
  mergeMonthlyActivity,
  searchInstitutions
} = require('../src/repository-data');
const { createDashboardSnapshot, generateDashboardMarkdown } = require('../src/dashboard');
const { createSyndicationSnapshot } = require('../src/syndication');
const { createServer } = require('../src/server');

const repoRoot = path.resolve(__dirname, '..');

test('institution index parses repository-backed entries', () => {
  const institutions = getInstitutionIndex(repoRoot);
  assert.ok(institutions.length > 50);

  const vatican = institutions.find((entry) => entry.institution === 'Holy See (Vatican)');
  assert.ok(vatican);
  assert.equal(vatican.region, 'Europe');

  const searchResults = searchInstitutions(repoRoot, 'Al-Azhar');
  assert.ok(searchResults.some((entry) => entry.institution.includes('Al-Azhar')));
});

test('dashboard generation removes manual placeholders', () => {
  const snapshot = createDashboardSnapshot(repoRoot);
  const markdown = generateDashboardMarkdown(snapshot);
  assert.ok(markdown.includes('PANORAFUS.AI'));
  assert.equal(markdown.includes('TBD'), false);
  assert.ok(snapshot.kpis.institutionsIndexed > 0);
  const june = snapshot.monthlyActivity.find((entry) => entry.month === 'June');
  const july = snapshot.monthlyActivity.find((entry) => entry.month === 'July');
  assert.ok(june.totalActivity > 0);
  assert.ok(july.totalActivity > 0);
});

test('monthly activity fallback preserves prior metrics by month identity', () => {
  const merged = mergeMonthlyActivity([
    { monthIndex: 5, month: 'June', commits: 0, docsTouched: 0, workflowChanges: 0, codeChanges: 0, totalActivity: 0 },
    { monthIndex: 6, month: 'July', commits: 1, docsTouched: 1, workflowChanges: 0, codeChanges: 0, totalActivity: 2 }
  ], [
    { monthIndex: 6, month: 'July', commits: 41, docsTouched: 62, workflowChanges: 12, codeChanges: 0, totalActivity: 115 },
    { monthIndex: 5, month: 'June', commits: 2, docsTouched: 2, workflowChanges: 0, codeChanges: 0, totalActivity: 4 }
  ]);

  assert.deepEqual(merged, [
    { monthIndex: 5, month: 'June', commits: 2, docsTouched: 2, workflowChanges: 0, codeChanges: 0, totalActivity: 4 },
    { monthIndex: 6, month: 'July', commits: 41, docsTouched: 62, workflowChanges: 12, codeChanges: 0, totalActivity: 115 }
  ]);
});

test('content syndication workflow pushes generated artifacts directly', () => {
  const workflowPath = path.join(repoRoot, '.github', 'workflows', 'content-syndication.yml');
  assert.ok(fs.existsSync(workflowPath));
  const workflow = fs.readFileSync(workflowPath, 'utf8');

  assert.match(workflow, /git push origin HEAD:\$\{\{ github\.ref_name \}\}/);
  assert.doesNotMatch(workflow, /create-pull-request/);
});

test('platform API serves health, institution, and chatbot responses', async () => {
  const server = createServer({ repoRoot, host: '127.0.0.1', port: 0 });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  try {
    const { port } = server.address();
    const healthResponse = await fetch(`http://127.0.0.1:${port}/api/health`);
    assert.equal(healthResponse.status, 200);
    const health = await healthResponse.json();
    assert.equal(health.status, 'ok');
    assert.equal(health.config.chat.provider, 'local');

    const regionResponse = await fetch(`http://127.0.0.1:${port}/api/institutions/europe`);
    assert.equal(regionResponse.status, 200);
    const region = await regionResponse.json();
    assert.equal(region.filterType, 'region');
    assert.ok(region.total > 0);

    const chatResponse = await fetch(`http://127.0.0.1:${port}/api/chat?q=What does PANORAFUS say about robotic services?`);
    assert.equal(chatResponse.status, 200);
    const chat = await chatResponse.json();
    assert.ok(chat.answer.includes('PANORAFUS.AI'));
    assert.ok(Array.isArray(chat.citations));
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('syndication snapshot uses document summaries instead of raw commit subjects', () => {
  const snapshot = createSyndicationSnapshot(repoRoot);
  const finalReview = snapshot.items.find((item) => item.file === 'PANORAFUS_AI_FINAL_REVIEW.md');
  const summaryPage = snapshot.items.find((item) => item.file === 'SUMMARY.md');
  assert.ok(finalReview);
  assert.ok(summaryPage);
  assert.match(finalReview.summary, /official approval of the PANORAFUS\.AI final execution implementation/i);
  assert.doesNotMatch(finalReview.summary, /merge pull request/i);
  assert.equal(summaryPage.summary, 'Summary');
});

test('document summary fallback uses the title for short branding-only content', () => {
  const summary = extractDocumentSummary([
    '# PANORAFUS.AI',
    '',
    '> **PANORAFUS.AI** — The Pivotal Head of the Global Network',
    '',
    'Website: panorafus.ai'
  ].join('\n'), 'PANORAFUS.AI', 'README.md');

  assert.equal(summary, 'PANORAFUS.AI');
});
