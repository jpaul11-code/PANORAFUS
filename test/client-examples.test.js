'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const load = () => import('../frontend/client-examples/client.mjs');
const json = (payload, status = 200) => new Response(JSON.stringify(payload), {
  status, headers: { 'Content-Type': 'application/json' }
});

test('client keeps tokens in memory and refreshes concurrent unauthorized requests once', async () => {
  const { PanorafusClient } = await load();
  let refreshes = 0;
  const client = new PanorafusClient('https://api.example.test/api/v1', async (url, options) => {
    const path = new URL(url).pathname;
    if (path.endsWith('/auth/login')) {
      return json({ access_token: 'expired', refresh_token: 'rotation-one', user: { role: 'user' } });
    }
    if (path.endsWith('/auth/refresh')) {
      refreshes += 1;
      await new Promise((resolve) => setTimeout(resolve, 10));
      return json({ access_token: 'fresh', refresh_token: 'rotation-two' });
    }
    return options.headers.Authorization === ['Bearer', 'fresh'].join(' ')
      ? json({ items: [], limit: 20, offset: 0 })
      : json({ error: { code: 'UNAUTHORIZED', message: 'Expired' } }, 401);
  });
  await client.login('reader@example.test', 'example-password-for-test');
  const results = await Promise.all([
    client.request('GET', '/journals'), client.request('GET', '/prayers')
  ]);
  assert.equal(refreshes, 1);
  assert.equal(client.refreshToken, 'rotation-two');
  assert.equal(results.length, 2);
});

test('logout cannot be undone by a pending refresh', async () => {
  const { PanorafusClient } = await load();
  let resolveRefresh;
  const client = new PanorafusClient('http://127.0.0.1:4000/api/v1', async (url) => {
    if (new URL(url).pathname.endsWith('/auth/refresh')) {
      return new Promise((resolve) => { resolveRefresh = resolve; });
    }
    return new Response(null, { status: 204 });
  });
  client.accessToken = 'old';
  client.refreshToken = 'old-refresh';
  const refresh = client.refresh();
  const rejected = assert.rejects(refresh, /Authentication changed/);
  await client.logout();
  resolveRefresh(json({ access_token: 'new', refresh_token: 'new-refresh' }));
  await rejected;
  assert.equal(client.accessToken, null);
  assert.equal(client.refreshToken, null);
});

test('client errors preserve request ID and validation details without leaking tokens', async () => {
  const { PanorafusClient, ApiError } = await load();
  const client = new PanorafusClient('https://api.example.test/api/v1', async () => json({
    error: { code: 'VALIDATION_ERROR', message: 'Invalid title', request_id: 'request-one', details: ['title'] }
  }, 400));
  await assert.rejects(client.request('POST', '/journals', { body: {} }), (error) => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.status, 400);
    assert.equal(error.requestId, 'request-one');
    assert.deepEqual(error.details, ['title']);
    return true;
  });
});

test('logout revokes server credentials even when its access token has expired', async () => {
  const { PanorafusClient } = await load();
  const calls = [];
  const client = new PanorafusClient('https://api.example.test/api/v1', async (url, options) => {
    calls.push({ path: new URL(url).pathname, options });
    if (calls.length === 1) return json({ error: { message: 'Expired' } }, 401);
    if (calls.length === 2) return json({ access_token: 'ephemeral', refresh_token: 'replacement' });
    return new Response(null, { status: 204 });
  });
  client.accessToken = 'expired';
  client.refreshToken = 'original';
  await client.logout();
  assert.deepEqual(calls.map(({ path }) => path), [
    '/api/v1/auth/logout', '/api/v1/auth/refresh', '/api/v1/auth/logout'
  ]);
  assert.deepEqual(JSON.parse(calls[2].options.body), { refresh_token: 'replacement' });
  assert.equal(calls[2].options.headers.Authorization, ['Bearer', 'ephemeral'].join(' '));
  assert.equal(client.accessToken, null);
  assert.equal(client.refreshToken, null);
});

test('client rejects insecure bases and path traversal', async () => {
  const { PanorafusClient, resourceId } = await load();
  assert.throws(() => new PanorafusClient('http://api.example.test/api/v1'), /HTTPS/);
  const credentialUrl = new URL('https://api.example.test/api/v1');
  credentialUrl.username = 'reader';
  assert.throws(() => new PanorafusClient(credentialUrl.href), /credentials/);
  const client = new PanorafusClient('https://api.example.test/api/v1');
  for (const path of ['//external.test', '/../other', '/%2e%2e/other', '/journals?access_token=x', '/.\n./other']) {
    await assert.rejects(client.request('GET', path), /relative API path/);
  }
  assert.throws(() => resourceId('../admin'), /UUID/);
});

test('notification stream parses split UTF-8 and CRLF frames using bearer headers', async () => {
  const { PanorafusClient } = await load();
  let request;
  const encoded = new TextEncoder().encode(': heartbeat\r\n\r\nevent: notification\r\nid: n1\r\ndata: {"title":"Espérance"}\r\n\r\n');
  const client = new PanorafusClient('https://api.example.test/api/v1', async (url, options) => {
    request = { url, options };
    return new Response(new ReadableStream({
      start(controller) {
        for (const byte of encoded) controller.enqueue(new Uint8Array([byte]));
        controller.close();
      }
    }), { headers: { 'Content-Type': 'text/event-stream' } });
  });
  client.accessToken = 'memory-only';
  const events = [];
  await client.notifications((event) => events.push(event));
  assert.equal(request.options.headers.Authorization, ['Bearer', 'memory-only'].join(' '));
  assert.equal(new URL(request.url).search, '');
  assert.deepEqual(events, [{ event: 'notification', id: 'n1', data: { title: 'Espérance' } }]);
});

test('endpoint examples use safe resource IDs, pagination, and expected bodies', async () => {
  const { endpoints } = await import('../frontend/client-examples/endpoints.mjs');
  const calls = [];
  const api = endpoints({ request: (...args) => calls.push(args) });
  const id = '123e4567-e89b-42d3-a456-426614174000';
  api.lessons.list(id, { limit: 20, offset: 0 });
  api.questions.answer(id, 'My reflection');
  api.accessibility.update({ high_contrast: true });
  assert.deepEqual(calls[0], ['GET', `/study-plans/${id}/lessons`, { query: { limit: 20, offset: 0 } }]);
  assert.deepEqual(calls[1][2], { body: { response_text: 'My reflection' } });
  assert.throws(() => api.admin.moderate('users', id), /Unsupported/);
});
