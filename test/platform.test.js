'use strict';

const fs = require('node:fs');
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { getInstitutionIndex, searchInstitutions } = require('../src/repository-data');
const { createDashboardSnapshot, generateDashboardMarkdown } = require('../src/dashboard');
const { createTrafficInsightsSnapshot } = require('../src/traffic-insights');
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
});

test('traffic insights snapshot includes regional and endpoint coverage', () => {
  const snapshot = createTrafficInsightsSnapshot(repoRoot);
  assert.equal(snapshot.regions.length, 6);
  assert.ok(snapshot.endpointStats.some((entry) => entry.path === '/api/traffic-insights'));
  assert.ok(snapshot.highlights.topRegion);
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

    const trafficResponse = await fetch(`http://127.0.0.1:${port}/api/traffic-insights`);
    assert.equal(trafficResponse.status, 200);
    const traffic = await trafficResponse.json();
    assert.equal(traffic.regions.length, 6);
    assert.ok(traffic.endpointStats.some((entry) => entry.path === '/api/traffic-insights'));

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

    const pageResponse = await fetch(`http://127.0.0.1:${port}/traffic-insights/`);
    assert.equal(pageResponse.status, 200);
    const page = await pageResponse.text();
    assert.match(page, /PANORAFUS\.AI Traffic Insights Index/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
