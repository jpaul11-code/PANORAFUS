'use strict';

const { execFileSync } = require('child_process');
const path = require('path');

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

module.exports = { validate };
