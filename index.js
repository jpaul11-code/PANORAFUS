'use strict';

const { execFileSync } = require('child_process');
const path = require('path');
const { loadConfig } = require('./src/config');
const {
  buildPlatformSnapshot,
  getRepositoryMetrics,
  getInstitutionIndex,
  searchInstitutions,
  listRegionMetrics,
  listTraditionMetrics
} = require('./src/repository-data');
const { createServer, startServer } = require('./src/server');
const { answerQuestion } = require('./src/chatbot');
const {
  createDashboardSnapshot,
  generateDashboardMarkdown,
  generateDashboardFile
} = require('./src/dashboard');
const {
  createSyndicationSnapshot,
  writeSyndicationArtifacts
} = require('./src/syndication');

/**
 * PANORAFUS.AI package runner entry point.
 * Provides programmatic access to PANORAFUS.AI documentation validation.
 */

const REPO_ROOT = path.resolve(__dirname);
const VALIDATE_SCRIPT = path.join(REPO_ROOT, 'scripts', 'validate-docs.sh');

/**
 * Run the PANORAFUS.AI documentation validation script.
 * Throws if validation fails.
 * @param {string} [repoRoot] - Optional path to the repository root. Defaults to the package root.
 */
function validate(repoRoot) {
  const root = repoRoot ? path.resolve(repoRoot) : REPO_ROOT;
  execFileSync('bash', [VALIDATE_SCRIPT, root], { stdio: 'inherit' });
}

module.exports = {
  answerQuestion,
  buildPlatformSnapshot,
  createDashboardSnapshot,
  createServer,
  createSyndicationSnapshot,
  generateDashboardFile,
  generateDashboardMarkdown,
  getInstitutionIndex,
  getRepositoryMetrics,
  listRegionMetrics,
  listTraditionMetrics,
  loadConfig,
  searchInstitutions,
  startServer,
  validate,
  writeSyndicationArtifacts
};
