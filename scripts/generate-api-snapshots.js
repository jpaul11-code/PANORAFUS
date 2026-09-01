'use strict';

const fs = require('fs');
const path = require('path');
const { loadConfig, getSafeConfigView } = require('../src/config');
const {
  getInstitutionIndex,
  getRepositoryMetrics,
  listRegionMetrics,
  listTraditionMetrics
} = require('../src/repository-data');
const { createDashboardSnapshot } = require('../src/dashboard');
const { createTrafficInsightsSnapshot } = require('../src/traffic-insights');
const { createSyndicationSnapshot } = require('../src/syndication');

function writeJson(filePath, payload) {
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}

const repoRoot = path.resolve(__dirname, '..');
const config = loadConfig(process.env, { repoRoot });
const outputDir = path.join(repoRoot, 'public', 'api');
const institutions = getInstitutionIndex(repoRoot);
fs.mkdirSync(outputDir, { recursive: true });

writeJson(path.join(outputDir, 'health.json'), {
  service: 'PANORAFUS.AI Platform API',
  status: 'ok',
  config: getSafeConfigView(config),
  metrics: getRepositoryMetrics(repoRoot)
});
writeJson(path.join(outputDir, 'dashboard.json'), createDashboardSnapshot(repoRoot));
writeJson(path.join(outputDir, 'traffic-insights.json'), createTrafficInsightsSnapshot(repoRoot));
writeJson(path.join(outputDir, 'institutions.json'), {
  total: institutions.length,
  items: institutions
});
writeJson(path.join(outputDir, 'regions.json'), listRegionMetrics(repoRoot));
writeJson(path.join(outputDir, 'traditions.json'), listTraditionMetrics(repoRoot));
writeJson(path.join(outputDir, 'syndication.json'), createSyndicationSnapshot(repoRoot));
