const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID, randomBytes } = require('node:crypto');
const jwt = require('jsonwebtoken');
const { createApp } = require('../app');
const { loadConfig } = require('../config');
const { fakeDatabase } = require('./fake-db');
const { authService, hashPassword, checkPassword } = require('../services/auth');

async function fixture(t, options = {}) {
  const db = fakeDatabase();
  const config = loadConfig({ JWT_SECRET: randomBytes(48).toString('hex'), CORS_ORIGINS: 'https://app.example',
    SSE_POLL_MS: '100', ...options.env });
  const auth = authService(db, config);
  await db.language.create({ data: { code: 'en', name: 'English', native_name: 'English' } });
  const users = {};
  for (const role of ['user', 'leader', 'pastor', 'admin']) {
    const user = await db.user.create({ data: { email: `${role}@example.com`, password_hash: await hashPassword('SafePassphrase!123'),
      role, profile: { create: { display_name: role } } }, include: { profile: true } });
    users[role] = { ...user, tokens: await auth.issue(db, user) };
  }
  const other = await db.user.create({ data: { email: 'other@example.com', role: 'user',
    password_hash: await hashPassword('SafePassphrase!123'), profile: { create: { display_name: 'Other' } } }, include: { profile: true } });
  users.other = { ...other, tokens: await auth.issue(db, other) };
  const app = createApp({ db, config, ...options });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  async function request(method, path, data, role = 'user', headers = {}) {
    const response = await fetch(base + (path.startsWith('/health') || path.startsWith('/ready') ? path : '/api/v1' + path), {
      method, headers: { ...(data !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(role ? { Authorization: ['Bearer', users[role]?.tokens.access_token || role].join(' ') } : {}), ...headers },
      ...(data !== undefined ? { body: JSON.stringify(data) } : {})
    });
    const value = response.status === 204 ? null : await response.json();
    return { status: response.status, value, headers: response.headers };
  }
  return { db, config, auth, users, request, base };
}
function status(result, expected) {
  assert.equal(result.status, expected, JSON.stringify(result.value));
  return result.value;
}
async function planLesson(f, published = false) {
  const plan = status(await f.request('POST', '/study-plans', { title: 'Hope', description: 'Study hope', is_published: published }, 'leader'), 201);
  const lesson = status(await f.request('POST', `/study-plans/${plan.id}/lessons`, { title: 'Romans', position: 1 }, 'leader'), 201);
  return { plan, lesson };
}

test('configuration rejects weak secrets, origins, and insecure AI endpoints', () => {
  for (const secret of ['', 'x'.repeat(64), 'replace-this-with-a-secret-of-32-characters']) {
    assert.throws(() => loadConfig({ JWT_SECRET: secret }));
  }
  const JWT_SECRET = randomBytes(48).toString('hex');
  for (const env of [{ CORS_ORIGINS: '*' }, { CORS_ORIGINS: 'https://app.example/path' },
    { AI_ENDPOINT: 'http://provider.example' }, { PORT: '-1' }, { ACCESS_TOKEN_TTL_SECONDS: '3' }]) {
    assert.throws(() => loadConfig({ JWT_SECRET, ...env }));
  }
});
test('scrypt passwords use random salts and constant-length hashes', async () => {
  const a = await hashPassword('SafePassphrase!123');
  const b = await hashPassword('SafePassphrase!123');
  assert.notEqual(a, b);
  assert.equal(await checkPassword('SafePassphrase!123', a), true);
  assert.equal(await checkPassword('wrong', a), false);
  assert.equal(await checkPassword('wrong', 'invalid'), false);
});
test('health/readiness, CORS, secure headers, and unknown route envelopes', async t => {
  const f = await fixture(t);
  status(await f.request('GET', '/health', undefined, null), 200);
  status(await f.request('GET', '/ready', undefined, null), 200);
  f.db.$queryRaw = async () => { throw new Error('postgres password must not leak'); };
  const failure = status(await f.request('GET', '/ready', undefined, null), 503);
  assert.equal(failure.error.code, 'NOT_READY');
  const missing = status(await f.request('GET', '/missing'), 404);
  assert.ok(missing.error.request_id);
  const blocked = status(await f.request('GET', '/languages', undefined, null, { Origin: 'https://evil.example' }), 403);
  assert.equal(blocked.error.code, 'CORS_FORBIDDEN');
  const allowed = await f.request('GET', '/languages', undefined, null, { Origin: 'https://app.example' });
  assert.equal(allowed.headers.get('access-control-allow-origin'), 'https://app.example');
  assert.equal(allowed.headers.get('x-content-type-options'), 'nosniff');
});
test('registration/login enforce role whitelist, normalized email, safe user output and conflict', async t => {
  const f = await fixture(t);
  const input = { email: 'NEW@EXAMPLE.COM', password: 'SafePassphrase!123', display_name: 'New' };
  status(await f.request('POST', '/auth/register', { ...input, role: 'admin' }, null), 400);
  status(await f.request('POST', '/auth/register', { ...input, password: 'short' }, null), 400);
  const registered = status(await f.request('POST', '/auth/register', input, null), 201);
  assert.equal(registered.user.email, 'new@example.com');
  assert.equal(registered.user.role, 'user');
  assert.equal(registered.user.password_hash, undefined);
  assert.equal(registered.token_type, 'Bearer');
  status(await f.request('POST', '/auth/register', input, null), 409);
  status(await f.request('POST', '/auth/login', { email: input.email, password: input.password }, null), 200);
  status(await f.request('POST', '/auth/login', { email: input.email, password: 'incorrect' }, null), 401);
  status(await f.request('POST', '/auth/login', { email: 'unknown@example.com', password: input.password }, null), 401);
  assert.ok(f.db.tables.refreshToken.every(x => !registered.refresh_token.includes(x.token_hash)));
});
test('JWT algorithm/issuer/audience checks, expiry, suspension, logout invalidation', async t => {
  const f = await fixture(t);
  status(await f.request('GET', '/users/me', undefined, null), 401);
  const payload = { sub: f.users.user.id, ver: 0 };
  for (const token of [
    jwt.sign(payload, f.config.secret, { algorithm: 'HS384', issuer: f.config.issuer, audience: f.config.audience }),
    jwt.sign(payload, f.config.secret, { issuer: 'wrong', audience: f.config.audience }),
    jwt.sign(payload, f.config.secret, { issuer: f.config.issuer, audience: 'wrong' }),
    jwt.sign(payload, f.config.secret, { issuer: f.config.issuer, audience: f.config.audience, expiresIn: -1 })
  ]) status(await f.request('GET', '/users/me', undefined, token), 401);
  await f.db.user.update({ where: { id: f.users.user.id }, data: { status: 'suspended' } });
  status(await f.request('GET', '/users/me'), 401);
  await f.db.user.update({ where: { id: f.users.user.id }, data: { status: 'active' } });
  status(await f.request('POST', '/auth/logout', { refresh_token: f.users.other.tokens.refresh_token }), 401);
  status(await f.request('POST', '/auth/logout', { refresh_token: f.users.user.tokens.refresh_token }), 204);
  status(await f.request('GET', '/users/me'), 401);
  status(await f.request('POST', '/auth/refresh', { refresh_token: f.users.user.tokens.refresh_token }, null), 401);
});
test('refresh rotates atomically, reuse revokes entire family and access tokens', async t => {
  const f = await fixture(t);
  const original = f.users.user.tokens.refresh_token;
  const rotated = status(await f.request('POST', '/auth/refresh', { refresh_token: original }, null), 200);
  assert.notEqual(rotated.refresh_token, original);
  status(await f.request('POST', '/auth/refresh', { refresh_token: original }, null), 401);
  status(await f.request('POST', '/auth/refresh', { refresh_token: rotated.refresh_token }, null), 401);
  status(await f.request('GET', '/users/me', undefined, rotated.access_token), 401);
  const another = await f.auth.issue(f.db, await f.db.user.findUnique({ where: { id: f.users.other.id } }));
  const results = await Promise.all([1, 2].map(() => f.request('POST', '/auth/refresh', { refresh_token: another.refresh_token }, null)));
  assert.deepEqual(results.map(x => x.status).sort(), [200, 401]);
  const success = results.find(x => x.status === 200).value;
  status(await f.request('POST', '/auth/refresh', { refresh_token: success.refresh_token }, null), 401);
});
test('expired-access logout keeps JWT requirement; refresh-then-logout revokes credentials', async t => {
  const f = await fixture(t);
  const expired = jwt.sign({ ver: 0 }, f.config.secret, {
    subject: f.users.user.id, issuer: f.config.issuer, audience: f.config.audience, expiresIn: -1
  });
  const original = f.users.user.tokens.refresh_token;
  status(await f.request('POST', '/auth/logout', { refresh_token: original }, expired), 401);
  const rotated = status(await f.request('POST', '/auth/refresh', { refresh_token: original }, null), 200);
  status(await f.request('POST', '/auth/logout', { refresh_token: rotated.refresh_token }, rotated.access_token), 204);
  status(await f.request('POST', '/auth/refresh', { refresh_token: rotated.refresh_token }, null), 401);
  status(await f.request('GET', '/users/me', undefined, rotated.access_token), 401);
});
test('public bible endpoints, pagination, bounded and strict query validation', async t => {
  const f = await fixture(t);
  const book = await f.db.bibleBook.create({ data: { name: 'Romans', abbreviation: 'Rom', testament: 'new', canonical_order: 45 } });
  const passage = await f.db.biblePassage.create({ data: { book_id: book.id, chapter: 8, verse_start: 1, verse_end: 1,
    text: 'Public domain Scripture sample', translation: 'WEB', language_code: 'en', license: 'Public domain' } });
  for (const path of ['/languages', '/bible/books', `/bible/books/${book.id}`, '/bible/passages',
    `/bible/passages/${passage.id}`, '/bible/search?q=Scripture']) status(await f.request('GET', path, undefined, null), 200);
  const page = status(await f.request('GET', '/bible/books?limit=1&offset=1', undefined, null), 200);
  assert.deepEqual(page, { items: [], limit: 1, offset: 1 });
  for (const query of ['limit=0', 'limit=101', 'offset=-1', 'offset=1000001', 'limit=1&limit=2', 'unknown=true']) {
    status(await f.request('GET', '/bible/books?' + query, undefined, null), 400);
  }
  status(await f.request('GET', '/bible/search', undefined, null), 400);
  status(await f.request('GET', `/bible/books/${book.id}?unknown=true`, undefined, null), 400);
  status(await f.request('GET', '/bible/books/not-an-id', undefined, null), 400);
  status(await f.request('GET', '/bible/books/' + randomUUID(), undefined, null), 404);
});
test('profile visibility opt-in and ownership, language validation, accessibility', async t => {
  const f = await fixture(t);
  status(await f.request('GET', `/users/${f.users.other.id}`), 404);
  status(await f.request('PATCH', '/users/me', { role: 'admin' }), 400);
  status(await f.request('PATCH', '/users/me', { language_code: 'not_a_tag' }), 400);
  status(await f.request('PATCH', '/users/me', {}), 400);
  status(await f.request('PATCH', '/users/me', { display_name: 'Visible', is_public: true }), 200);
  const publicProfile = status(await f.request('GET', `/users/${f.users.user.id}`, undefined, 'other'), 200);
  assert.equal(publicProfile.display_name, 'Visible');
  assert.equal(publicProfile.id, f.users.user.id);
  assert.equal(publicProfile.email, undefined);
  status(await f.request('PATCH', '/users/me', { church_name: 'Local congregation', denomination: 'Independent',
    study_goal: 'Read Romans', location: 'Haiti', timezone: 'America/Port-au-Prince' }), 200);
  status(await f.request('PATCH', '/users/me', { timezone: 'invalid/timezone' }), 400);
  status(await f.request('PATCH', '/users/me', { church_name: null, denomination: null, study_goal: null,
    location: null, timezone: null }), 200);
  status(await f.request('GET', '/accessibility-settings'), 200);
  const settings = status(await f.request('PATCH', '/accessibility-settings', { font_size: 24, high_contrast: true }), 200);
  assert.equal(settings.font_size, 24);
  status(await f.request('PATCH', '/accessibility-settings', { font_size: 100 }), 400);
  status(await f.request('POST', '/languages', { code: 'fr-FR', name: 'French', native_name: 'Français' }), 403);
  status(await f.request('POST', '/languages', { code: 'fr-FR', name: 'French', native_name: 'Français' }, 'admin'), 201);
});
test('private plans are hidden through all nested learning, answers and comments routes', async t => {
  const f = await fixture(t);
  const { plan, lesson } = await planLesson(f);
  const question = status(await f.request('POST', '/questions', { title: 'Why?', body: 'Reflect', lesson_id: lesson.id }, 'leader'), 201);
  for (const path of [`/study-plans/${plan.id}`, `/study-plans/${plan.id}/lessons`, `/lessons/${lesson.id}`,
    `/lessons/${lesson.id}/questions`, `/lessons?plan_id=${plan.id}`, `/questions/${question.id}`,
    `/questions/${question.id}/answers`, `/comments?lesson_id=${lesson.id}`, `/comments?question_id=${question.id}`]) {
    status(await f.request('GET', path), 404);
  }
  for (const [path, input] of [[`/questions/${question.id}/answers`, { body: 'Answer' }],
    ['/comments', { body: 'Comment', lesson_id: lesson.id }],
    ['/study-sessions', { plan_id: plan.id }]]) status(await f.request('POST', path, input), 404);
  assert.equal(status(await f.request('GET', '/study-plans'), 200).items.length, 0);
  status(await f.request('POST', '/study-plans', { title: 'No', description: 'No' }), 403);
  status(await f.request('POST', '/questions', { title: 'No', body: 'No', lesson_id: lesson.id }), 404);
  status(await f.request('GET', `/study-plans/${plan.id}`, undefined, 'admin'), 200);
  status(await f.request('PATCH', `/study-plans/${plan.id}`, { is_published: true }, 'leader'), 200);
  status(await f.request('GET', `/questions/${question.id}`), 200);
  status(await f.request('PATCH', `/study-plans/${plan.id}`, { title: 'Stolen' }), 403);
});
test('learning CRUD, nested collections, private answers and sessions, references', async t => {
  const f = await fixture(t);
  const { plan, lesson } = await planLesson(f, true);
  for (const path of ['/study-plans', `/study-plans/${plan.id}/lessons`, `/lessons?plan_id=${plan.id}`,
    `/lessons/${lesson.id}`, `/lessons/${lesson.id}/questions`]) status(await f.request('GET', path), 200);
  status(await f.request('PATCH', `/lessons/${lesson.id}`, { content: 'New content' }, 'leader'), 200);
  const extra = status(await f.request('POST', '/lessons', { plan_id: plan.id, title: 'Extra', position: 2 }, 'leader'), 201);
  const question = status(await f.request('POST', '/questions', { title: 'Why?', body: 'Reflect', lesson_id: lesson.id }, 'leader'), 201);
  const answer = status(await f.request('POST', `/questions/${question.id}/answers`, { body: 'My private answer' }), 201);
  assert.equal(status(await f.request('GET', `/questions/${question.id}/answers`, undefined, 'admin'), 200).items.length, 0);
  status(await f.request('PATCH', `/answers/${answer.id}`, { body: 'Changed' }), 200);
  status(await f.request('PATCH', `/answers/${answer.id}`, { body: 'Stolen' }, 'admin'), 404);
  const session = status(await f.request('POST', '/study-sessions', { plan_id: plan.id, current_lesson_id: lesson.id }), 201);
  status(await f.request('GET', `/study-sessions/${session.id}`), 200);
  status(await f.request('GET', `/study-sessions/${session.id}`, undefined, 'admin'), 404);
  status(await f.request('PATCH', `/study-sessions/${session.id}`, { status: 'completed' }), 200);
  status(await f.request('GET', '/study-sessions'), 200);
  const second = await planLesson(f, true);
  status(await f.request('PATCH', `/study-sessions/${session.id}`, { current_lesson_id: second.lesson.id }), 400);
  status(await f.request('GET', '/questions?lesson_id=' + lesson.id), 200);
  status(await f.request('DELETE', `/lessons/${extra.id}`, undefined, 'leader'), 204);
  status(await f.request('DELETE', `/study-plans/${second.plan.id}`, undefined, 'leader'), 204);
});
test('journals and prayers owner-only CRUD excludes administrators; strict privacy', async t => {
  const f = await fixture(t);
  for (const path of ['/journals', '/prayers']) {
    const resource = status(await f.request('POST', path, { title: 'Private', body: 'Private content' }), 201);
    status(await f.request('GET', path), 200);
    status(await f.request('GET', `${path}/${resource.id}`), 200);
    status(await f.request('PATCH', `${path}/${resource.id}`, { title: 'Edited' }), 200);
    for (const role of ['other', 'admin']) {
      status(await f.request('GET', `${path}/${resource.id}`, undefined, role), 404);
      status(await f.request('PATCH', `${path}/${resource.id}`, { title: 'Stolen' }, role), 404);
      status(await f.request('DELETE', `${path}/${resource.id}`, undefined, role), 404);
    }
    status(await f.request('POST', path, { title: 'No', body: 'No', is_private: false }), 400);
    status(await f.request('DELETE', `${path}/${resource.id}`), 204);
  }
});
test('groups leadership, member invitations, scoped sessions and comments', async t => {
  const f = await fixture(t);
  const group = status(await f.request('POST', '/groups', { name: 'Small group' }, 'leader'), 201);
  status(await f.request('GET', `/groups/${group.id}`), 404);
  status(await f.request('GET', '/groups'), 200);
  status(await f.request('POST', `/groups/${group.id}/members`, { user_id: f.users.user.id }), 404);
  status(await f.request('POST', `/groups/${group.id}/members`, { user_id: f.users.user.id, role: 'leader' }, 'leader'), 400);
  status(await f.request('POST', `/groups/${group.id}/members`, { user_id: f.users.user.id }, 'leader'), 201);
  status(await f.request('GET', `/groups/${group.id}`), 200);
  status(await f.request('GET', `/groups/${group.id}/members`), 200);
  status(await f.request('POST', `/groups/${group.id}/members`, { user_id: f.users.other.id }), 403);
  status(await f.request('PATCH', `/groups/${group.id}`, { name: 'Stolen' }), 403);
  status(await f.request('PATCH', `/groups/${group.id}`, { description: 'Edited' }, 'leader'), 200);
  const session = status(await f.request('POST', `/groups/${group.id}/sessions`, { title: 'Meeting', starts_at: '2026-11-01T12:00:00Z' }, 'leader'), 201);
  status(await f.request('GET', `/groups/${group.id}/sessions`), 200);
  status(await f.request('GET', `/group-sessions/${session.id}`), 200);
  status(await f.request('PATCH', `/group-sessions/${session.id}`, { title: 'Edited' }, 'leader'), 200);
  status(await f.request('PATCH', `/group-sessions/${session.id}`, { title: 'No' }), 403);
  status(await f.request('PATCH', `/group-sessions/${session.id}`, { ends_at: '2026-10-01T12:00:00Z' }, 'leader'), 400);
  const comment = status(await f.request('POST', '/comments', { body: 'Reflection', group_session_id: session.id }), 201);
  status(await f.request('GET', `/comments?group_session_id=${session.id}`), 200);
  status(await f.request('PATCH', `/comments/${comment.id}`, { body: 'Edited' }), 200);
  status(await f.request('PATCH', `/comments/${comment.id}`, { body: 'No' }, 'leader'), 403);
  status(await f.request('DELETE', `/comments/${comment.id}`), 204);
  status(await f.request('DELETE', `/groups/${group.id}/members/${f.users.leader.id}`, undefined, 'leader'), 409);
  status(await f.request('DELETE', `/groups/${group.id}/members/${f.users.user.id}`, undefined, 'leader'), 204);
  status(await f.request('GET', `/group-sessions/${session.id}`), 404);
  status(await f.request('DELETE', `/groups/${group.id}`, undefined, 'leader'), 204);
});
test('comments enforce exactly one parent and private-plan visibility', async t => {
  const f = await fixture(t);
  const { lesson, plan } = await planLesson(f, true);
  const question = status(await f.request('POST', '/questions', { title: 'Question', body: 'Reflect', lesson_id: lesson.id }, 'leader'), 201);
  status(await f.request('POST', '/comments', { body: 'Missing' }), 400);
  status(await f.request('POST', '/comments', { body: 'Ambiguous', lesson_id: lesson.id, question_id: question.id }), 400);
  status(await f.request('GET', '/comments'), 400);
  const comment = status(await f.request('POST', '/comments', { body: 'A thought', lesson_id: lesson.id }), 201);
  status(await f.request('PATCH', `/study-plans/${plan.id}`, { is_published: false }, 'leader'), 200);
  status(await f.request('PATCH', `/comments/${comment.id}`, { body: 'No longer visible' }), 404);
  status(await f.request('DELETE', `/comments/${comment.id}`), 404);
});
test('admin allowlist, atomic audit rollback and suspension invalidate credentials', async t => {
  const f = await fixture(t);
  status(await f.request('GET', '/admin/users'), 403);
  status(await f.request('GET', '/admin/users', undefined, 'admin'), 200);
  status(await f.request('GET', '/admin/audit-logs', undefined, 'admin'), 200);
  status(await f.request('PATCH', `/admin/users/${f.users.admin.id}`, { role: 'user' }, 'admin'), 409);
  status(await f.request('PATCH', `/admin/users/${f.users.user.id}`, { role: 'leader' }, 'admin'), 200);
  assert.equal(f.db.tables.adminAuditLog.length, 1);
  status(await f.request('GET', '/users/me'), 401);
  const journal = status(await f.request('POST', '/journals', { title: 'Private', body: 'Private' }, 'other'), 201);
  for (const type of ['users', 'adminAuditLog', 'audit-logs', '__proto__', 'constructor']) {
    status(await f.request('DELETE', `/admin/content/${type}/${journal.id}`, undefined, 'admin'), 400);
  }
  f.db.fail('adminAuditLog', 'create');
  const failure = status(await f.request('DELETE', `/admin/content/journals/${journal.id}`, undefined, 'admin'), 500);
  assert.equal(failure.error.message, 'An unexpected error occurred');
  assert.ok(await f.db.journal.findUnique({ where: { id: journal.id } }));
  status(await f.request('DELETE', `/admin/content/journals/${journal.id}`, undefined, 'admin'), 204);
  assert.equal(f.db.tables.adminAuditLog.length, 2);
  status(await f.request('PATCH', `/admin/users/${f.users.other.id}`, { status: 'suspended' }, 'admin'), 200);
  status(await f.request('GET', '/users/me', undefined, 'other'), 401);
});
test('notifications ownership and database-backed SSE replay, cancellation and revocation', async t => {
  const f = await fixture(t);
  const own = await f.db.notification.create({ data: { user_id: f.users.user.id, type: 'study', title: 'Mine', body: 'Mine' } });
  await f.db.notification.create({ data: { user_id: f.users.other.id, type: 'study', title: 'Other', body: 'Other' } });
  assert.equal(status(await f.request('GET', '/notifications'), 200).items.length, 1);
  status(await f.request('PATCH', `/notifications/${own.id}`, { is_read: true }), 200);
  status(await f.request('PATCH', `/notifications/${own.id}`, { is_read: true }, 'admin'), 404);
  const controller = new AbortController();
  const stream = await fetch(f.base + '/api/v1/notifications/stream', { signal: controller.signal,
    headers: { Authorization: ['Bearer', f.users.user.tokens.access_token].join(' ') } });
  assert.equal(stream.status, 200);
  const reader = stream.body.getReader();
  const first = Buffer.from((await reader.read()).value).toString();
  assert.match(first, /event: notification/);
  assert.match(first, /Mine/);
  assert.doesNotMatch(first, /Other/);
  const next = await f.db.notification.create({ data: { user_id: f.users.user.id, type: 'study', title: 'New', body: 'New' } });
  let emitted = '';
  while (!emitted.includes(next.id)) emitted += Buffer.from((await reader.read()).value).toString();
  await f.db.user.update({ where: { id: f.users.user.id }, data: { status: 'suspended' } });
  let done = false;
  while (!done) done = (await reader.read()).done;
  controller.abort();
  await f.db.user.update({ where: { id: f.users.user.id }, data: { status: 'active' } });
  const replay = await fetch(f.base + '/api/v1/notifications/stream', {
    headers: { Authorization: ['Bearer', f.users.user.tokens.access_token].join(' '), 'Last-Event-ID': own.id }
  });
  const replayReader = replay.body.getReader();
  assert.match(Buffer.from((await replayReader.read()).value).toString(), new RegExp(next.id));
  await replayReader.cancel();
  status(await f.request('DELETE', `/notifications/${own.id}`), 204);
});
test('SSE rejects query tokens and foreign cursors, and expires with its access token', async t => {
  const f = await fixture(t);
  status(await f.request('GET', '/notifications/stream', undefined, null), 401);
  status(await f.request('GET', '/notifications/stream?access_token=not-allowed'), 400);
  const foreign = await f.db.notification.create({ data: {
    user_id: f.users.other.id, type: 'private', title: 'Private', body: 'Private'
  } });
  status(await f.request('GET', '/notifications/stream', undefined, 'user', { 'Last-Event-ID': foreign.id }), 404);
  const shortToken = jwt.sign({ ver: 0 }, f.config.secret, {
    algorithm: 'HS256', subject: f.users.user.id, issuer: f.config.issuer, audience: f.config.audience, expiresIn: 2
  });
  const response = await fetch(f.base + '/api/v1/notifications/stream', {
    headers: { Authorization: ['Bearer', shortToken].join(' ') }
  });
  assert.equal(response.status, 200);
  const reader = response.body.getReader();
  let ended = false;
  while (!ended) ended = (await reader.read()).done;
  assert.ok(ended);
});
test('AI fails closed when unconfigured, validates request and rate limits', async t => {
  const f = await fixture(t, { authLimit: 2, aiLimit: 2 });
  status(await f.request('POST', '/ai/ask', { question: 'What is hope?' }), 503);
  status(await f.request('POST', '/ai/ask', { question: 'Question', unexpected: true }), 400);
  status(await f.request('POST', '/ai/ask', { question: 'Question' }), 429);
  const login = { email: 'user@example.com', password: 'wrong' };
  status(await f.request('POST', '/auth/login', login, null), 401);
  status(await f.request('POST', '/auth/login', login, null), 401);
  status(await f.request('POST', '/auth/login', login, null), 429);
});
test('API-wide limiting protects public database and authenticated authorization queries', async t => {
  const f = await fixture(t, { requestLimit: 2 });
  status(await f.request('GET', '/languages', undefined, null), 200);
  status(await f.request('GET', '/users/me'), 200);
  status(await f.request('GET', '/users/me'), 429);
});
test('AI fixed HTTPS endpoint receives structured schema and validated Socratic output', async t => {
  const { outputs, system } = require('../services/ai');
  const examples = {
    ask: { answer: 'Consider the passage', scripture_references: ['Romans 8:1'], reflection_question: 'What do you notice?', next_step: 'Read Romans 8' },
    'generate-study': { title: 'Hope', description: 'Reflect', lessons: [{ title: 'Romans', content: 'Reflect',
      scripture_references: ['Romans 8:1'], reflection_question: 'What do you notice?', next_step: 'Read' }] },
    'generate-questions': { questions: [{ question: 'What do you notice?', scripture_references: ['Romans 8:1'],
      reflection_question: 'Why?', next_step: 'Reflect' }] },
    'generate-prayer': { title: 'Hope', prayer: 'Help us reflect', scripture_references: ['Romans 8:1'],
      reflection_question: 'What brings hope?', next_step: 'Read' }
  };
  for (const operation of Object.keys(examples)) {
    examples[operation] = { ...examples.ask, ...examples[operation] };
  }
  const calls = [];
  const f = await fixture(t, { env: { AI_ENDPOINT: 'https://provider.example/generate', AI_MODEL: 'model' },
    fetch: async (url, options) => {
      const payload = JSON.parse(options.body); calls.push({ url, options, payload });
      return new Response(JSON.stringify(examples[payload.operation]), { status: 200 });
    } });
  for (const [operation, input] of Object.entries({ ask: { question: 'Hope?' },
    'generate-study': { topic: 'Hope', lesson_count: 1 }, 'generate-questions': { passage: 'Romans 8', count: 1 },
    'generate-prayer': { topic: 'Hope' } })) {
    const result = status(await f.request('POST', '/ai/' + operation, input), 200);
    assert.ok(outputs[operation].safeParse(result).success);
  }
  assert.equal(calls.length, 4);
  assert.ok(calls.every(x => x.url === 'https://provider.example/generate' && x.options.redirect === 'error'));
  assert.match(system, /eschatology neutrally/);
  assert.match(system, /Socratic/);
  assert.ok(calls.every(x => x.payload.output_schema.type === 'object'));
});
test('AI malformed, excessive and timeout provider output produces safe 503', async t => {
  for (const fetchImpl of [
    async () => new Response('not JSON'),
    async () => new Response(JSON.stringify({ answer: 'Missing fields' })),
    async () => new Response('x'.repeat(262145)),
    async () => new Response('private provider failure', { status: 500 }),
    async (url, options) => new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('Timeout'))))
  ]) {
    const f = await fixture(t, { env: { AI_ENDPOINT: 'https://provider.example', AI_MODEL: 'model', AI_TIMEOUT_MS: '100' }, fetch: fetchImpl });
    const result = status(await f.request('POST', '/ai/ask', { question: 'Hope?' }), 503);
    assert.equal(result.error.code, 'AI_UNAVAILABLE');
    assert.equal(result.error.details, undefined);
  }
});
test('malformed JSON, content types and oversized bodies use safe error envelopes', async t => {
  const f = await fixture(t);
  for (const [raw, headers] of [['{', { 'Content-Type': 'application/json' }], ['plain', { 'Content-Type': 'text/plain' }],
    [JSON.stringify({ question: 'x'.repeat(66000) }), { 'Content-Type': 'application/json' }]]) {
    const response = await fetch(f.base + '/api/v1/ai/ask', {
      method: 'POST', headers: { ...headers, Authorization: ['Bearer', f.users.user.tokens.access_token].join(' ') }, body: raw
    });
    assert.equal(response.status, 400);
    assert.ok((await response.json()).error.request_id);
  }
});
