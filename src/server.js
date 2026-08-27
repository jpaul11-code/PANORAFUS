'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { loadConfig, getSafeConfigView } = require('./config');
const { answerQuestion } = require('./chatbot');
const {
  getInstitutionIndex,
  getRepositoryMetrics,
  listRegionMetrics,
  listTraditionMetrics,
  searchInstitutions
} = require('./repository-data');
const { createDashboardSnapshot } = require('./dashboard');
const { createSyndicationSnapshot } = require('./syndication');

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  response.end(JSON.stringify(payload, null, 2));
}

function sendText(response, statusCode, body) {
  response.writeHead(statusCode, {
    'Content-Type': 'text/plain; charset=utf-8'
  });
  response.end(body);
}

function collectBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    request.on('error', reject);
  });
}

function routeFilter(repoRoot, slug) {
  const normalizedSlug = slug.toLowerCase();
  const institutions = getInstitutionIndex(repoRoot);
  const region = listRegionMetrics(repoRoot).find((entry) => entry.regionSlug === normalizedSlug);
  if (region) {
    return {
      filterType: 'region',
      filter: region.region,
      items: institutions.filter((entry) => entry.regionSlug === normalizedSlug)
    };
  }

  const traditions = listTraditionMetrics(repoRoot);
  const tradition = traditions.find((entry) => (
    entry.tradition.toLowerCase().replace(/[^a-z0-9]+/g, '-') === normalizedSlug
  ));
  if (tradition) {
    return {
      filterType: 'tradition',
      filter: tradition.tradition,
      items: institutions.filter((entry) => entry.tradition.toLowerCase() === tradition.tradition.toLowerCase())
    };
  }

  return null;
}

async function handleRequest(request, response, config) {
  if (request.method === 'OPTIONS') {
    response.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    response.end();
    return;
  }

  const url = new URL(request.url, 'http://127.0.0.1');
  const segments = url.pathname.split('/').filter(Boolean);
  const repoRoot = config.repoRoot;

  if (url.pathname === '/') {
    sendJson(response, 200, {
      name: 'PANORAFUS.AI Platform API',
      endpoints: [
        '/api/health',
        '/api/dashboard',
        '/api/institutions',
        '/api/institutions/search?q=keyword',
        '/api/institutions/{region}',
        '/api/institutions/{tradition}',
        '/api/chat?q=question'
      ]
    });
    return;
  }

  if (segments[0] !== 'api') {
    const requestedPath = path.resolve(config.publicDir, url.pathname.replace(/^\/+/, ''));
    if (!requestedPath.startsWith(path.resolve(config.publicDir))) {
      sendText(response, 403, 'Forbidden');
      return;
    }
    if (fs.existsSync(requestedPath) && fs.statSync(requestedPath).isFile()) {
      response.writeHead(200, { 'Content-Type': 'application/octet-stream' });
      fs.createReadStream(requestedPath).pipe(response);
      return;
    }
    sendText(response, 404, 'Not found');
    return;
  }

  if (url.pathname === '/api/health') {
    sendJson(response, 200, {
      service: 'PANORAFUS.AI Platform API',
      status: 'ok',
      config: getSafeConfigView(config),
      metrics: getRepositoryMetrics(repoRoot)
    });
    return;
  }

  if (url.pathname === '/api/dashboard') {
    sendJson(response, 200, createDashboardSnapshot(repoRoot));
    return;
  }

  if (url.pathname === '/api/syndication') {
    sendJson(response, 200, createSyndicationSnapshot(repoRoot));
    return;
  }

  if (url.pathname === '/api/institutions' && request.method === 'GET') {
    const items = getInstitutionIndex(repoRoot);
    sendJson(response, 200, {
      total: items.length,
      items
    });
    return;
  }

  if (url.pathname === '/api/institutions/search' && request.method === 'GET') {
    const query = url.searchParams.get('q') || '';
    const items = searchInstitutions(repoRoot, query);
    sendJson(response, 200, {
      query,
      total: items.length,
      items
    });
    return;
  }

  if (segments[1] === 'institutions' && segments[2] && request.method === 'GET') {
    const routed = routeFilter(repoRoot, segments[2].toLowerCase());
    if (!routed) {
      sendJson(response, 404, { error: `Unknown institution filter: ${segments[2]}` });
      return;
    }
    sendJson(response, 200, {
      filterType: routed.filterType,
      filter: routed.filter,
      total: routed.items.length,
      items: routed.items
    });
    return;
  }

  if (url.pathname === '/api/chat') {
    const question = request.method === 'GET'
      ? (url.searchParams.get('q') || '')
      : (() => null)();

    let prompt = question;
    if (request.method === 'POST') {
      const body = await collectBody(request);
      let parsed = {};
      try {
        parsed = body ? JSON.parse(body) : {};
      } catch (error) {
        sendJson(response, 400, { error: 'Request body must be valid JSON.' });
        return;
      }
      prompt = parsed.question || parsed.q || '';
    }

    if (!prompt.trim()) {
      sendJson(response, 400, { error: 'A question is required via q=... or {"question":"..."}.' });
      return;
    }

    const answer = await answerQuestion(prompt, repoRoot, config.chat);
    sendJson(response, 200, answer);
    return;
  }

  sendText(response, 404, 'Not found');
}

function createServer(overrides = {}) {
  const config = loadConfig(process.env, overrides);
  return http.createServer((request, response) => {
    Promise.resolve(handleRequest(request, response, config)).catch((error) => {
      sendJson(response, 500, { error: error.message });
    });
  });
}

function startServer(overrides = {}) {
  const config = loadConfig(process.env, overrides);
  const server = createServer(overrides);
  return new Promise((resolve) => {
    server.listen(config.port, config.host, () => resolve({ server, config }));
  });
}

if (require.main === module) {
  startServer().then(({ config }) => {
    process.stdout.write(`PANORAFUS.AI server listening on http://${config.host}:${config.port}\n`);
  }).catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  createServer,
  startServer
};
