const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID, randomBytes } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { createApp } = require('../app');
const { loadConfig } = require('../config');
const { authService } = require('../services/auth');
const jwt = require('jsonwebtoken');

test('real PostgreSQL: HTTP workflow, atomic rotation/replay, privacy cascades and audit', {
  skip: !process.env.API_TEST_DATABASE_URL,
  timeout: 60000
}, async t => {
  const { PrismaClient } = require('@prisma/client');
  const url = new URL(process.env.API_TEST_DATABASE_URL);
  const schema = 'api_test_' + randomUUID().replaceAll('-', '');
  const admin = new PrismaClient({ datasources: { db: { url: url.href } } });
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  let db, server;
  t.after(async () => {
    if (server) await new Promise(resolve => { server.closeAllConnections(); server.close(resolve); });
    if (db) await db.$disconnect();
    await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
    await admin.$disconnect();
  });
  url.searchParams.delete('schema');
  execFileSync('psql', [url.href, '-X', '-v', 'ON_ERROR_STOP=1', '-c', `SET search_path TO "${schema}"`,
    '-f', path.resolve(__dirname, '../../db/schema.sql')], { stdio: 'pipe' });
  url.searchParams.set('schema', schema);
  db = new PrismaClient({ datasources: { db: { url: url.href } } });
  await db.language.create({ data: { code: 'en', name: 'English', native_name: 'English' } });
  const config = loadConfig({ JWT_SECRET: randomBytes(48).toString('hex'), SSE_POLL_MS: '100' });
  const auth = authService(db, config);
  server = createApp({ db, config, authLimit: 100 }).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const tokens = {};
  async function request(method, endpoint, body, actor, expected = 200) {
    const response = await fetch(base + '/api/v1' + endpoint, {
      method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(actor ? { Authorization: ['Bearer', tokens[actor].access_token].join(' ') } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    const value = response.status === 204 ? null : await response.json();
    assert.equal(response.status, expected, JSON.stringify(value));
    return value;
  }
  for (const actor of ['leader', 'user', 'admin', 'other']) {
    tokens[actor] = await request('POST', '/auth/register', {
      email: `${actor}@integration.example`, password: 'Integration-passphrase!123',
      ...(actor === 'user' ? { full_name: actor, preferred_language: 'en' } : { display_name: actor })
    }, null, 201);
    if (actor === 'leader' || actor === 'admin') {
      const user = await db.user.update({ where: { id: tokens[actor].user.id },
        data: { role: actor }, include: { profile: true } });
      tokens[actor] = await auth.issue(db, user);
    }
  }
  await request('PATCH', '/users/me', { is_public: true, church_name: 'Personal congregation',
    location: 'Haiti', timezone: 'America/Port-au-Prince' }, 'user');
  const publicUser = await request('GET', `/users/${tokens.user.user.id}`, null, 'other');
  assert.equal(publicUser.id, tokens.user.user.id);
  assert.equal(publicUser.location, undefined);
  assert.equal(publicUser.church_name, undefined);
  assert.equal((await request('GET', '/users/me', null, 'user')).location, 'Haiti');
  const plan = await request('POST', '/study-plans', { title: 'Hope', description: 'A private study', topic: 'eschatology' }, 'leader', 201);
  assert.equal((await request('GET', '/study-plans?topic=eschatology', null, 'leader')).items.length, 1);
  const lesson = await request('POST', `/study-plans/${plan.id}/lessons`, { title: 'Romans', position: 1 }, 'leader', 201);
  const question = await request('POST', '/questions', { title: 'Why?', body: 'Reflect',
    question_type: 'reflection', lesson_id: lesson.id }, 'leader', 201);
  assert.equal(question.question_type, 'reflection');
  await request('GET', `/questions/${question.id}`, null, 'user', 404);
  await request('PATCH', `/study-plans/${plan.id}`, { is_published: true }, 'leader');
  const answer = await request('POST', `/questions/${question.id}/answers`, { response_text: 'Private answer' }, 'user', 201);
  assert.equal((await request('GET', `/questions/${question.id}/answers`, null, 'other')).items.length, 0);
  await request('PATCH', `/answers/${answer.id}`, { response_text: 'Edited answer' }, 'user');
  const session = await request('POST', '/study-sessions', { study_plan_id: plan.id,
    current_lesson_id: lesson.id, session_type: 'church' }, 'user', 201);
  assert.equal(session.session_type, 'church');
  const completedSession = await request('POST', '/study-sessions', { plan_id: plan.id, status: 'completed' }, 'user', 201);
  assert.equal(completedSession.completed_at, completedSession.started_at);
  await request('GET', '/study-sessions', null, 'user');
  const book = await db.bibleBook.create({ data: { name: 'Romans', abbreviation: 'Rom', testament: 'new', canonical_order: 45 } });
  const passage = await db.biblePassage.create({ data: { book_id: book.id, chapter: 8, verse_start: 1, verse_end: 1,
    text: 'Original test fixture', translation: 'fixture', language_code: 'en', license: 'Original test data' } });
  const journal = await request('POST', '/journals', { title: 'Reflection', content: 'Private',
    passage_id: passage.id, mood: 'hopeful', session_id: session.id, lesson_id: lesson.id }, 'user', 201);
  assert.equal(journal.body, 'Private');
  assert.equal(journal.passage_reference, passage.id);
  const settings = await request('PATCH', '/accessibility-settings', {
    text_size: 'large', reduced_motion: true, speech_enabled: true, simplified_language: true
  }, 'user');
  assert.equal(settings.font_size, 20);
  assert.equal(settings.speech_enabled, true);
  const prayer = await request('POST', '/prayers', { title: 'Thankfulness', body: 'Original prayer', status: 'answered' }, 'user', 201);
  assert.equal(prayer.answered_at, prayer.created_at);
  await request('PATCH', `/prayers/${prayer.id}`, { status: 'active' }, 'user');
  await request('GET', `/journals/${journal.id}`, null, 'admin', 404);
  const group = await request('POST', '/groups', { name: 'Group' }, 'leader', 201);
  await request('POST', `/groups/${group.id}/members`, { user_id: tokens.user.user.id }, 'leader', 201);
  const groupSession = await request('POST', `/groups/${group.id}/sessions`, {
    title: 'Study', lesson_id: lesson.id, starts_at: '2026-11-01T12:00:00Z'
  }, 'leader', 201);
  assert.equal((await request('PATCH', `/group-sessions/${groupSession.id}`, {
    status: 'live', notes: 'Original discussion notes'
  }, 'leader')).status, 'live');
  await request('GET', `/groups/${group.id}/sessions`, null, 'user');
  const comment = await request('POST', '/comments', { body: 'Thought', group_session_id: groupSession.id }, 'user', 201);
  await request('PATCH', `/study-plans/${plan.id}`, { is_published: false }, 'leader');
  assert.equal((await request('GET', `/groups/${group.id}/sessions`, null, 'user')).items.length, 0);
  assert.equal((await request('GET', '/study-sessions', null, 'user')).items.length, 0);
  await request('GET', `/group-sessions/${groupSession.id}`, null, 'user', 404);
  await request('PATCH', `/comments/${comment.id}`, { body: 'No longer accessible' }, 'user', 404);
  await request('DELETE', `/admin/content/journals/${journal.id}`, null, 'admin', 204);
  assert.equal(await db.adminAuditLog.count(), 1);
  await request('DELETE', `/admin/content/study-plans/${plan.id}`, null, 'admin', 409);
  assert.equal(await db.adminAuditLog.count(), 1);
  const rotate = tokens.other.refresh_token;
  const replies = await Promise.all([1, 2].map(async () => {
    const response = await fetch(base + '/api/v1/auth/refresh', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: rotate })
    });
    return { status: response.status, value: await response.json() };
  }));
  assert.deepEqual(replies.map(x => x.status).sort(), [200, 401]);
  tokens.other = replies.find(x => x.status === 200).value;
  await request('GET', '/users/me', null, 'other', 401);
  await request('POST', '/auth/refresh', { refresh_token: tokens.other.refresh_token }, null, 401);
  await request('POST', '/auth/logout', { refresh_token: tokens.user.refresh_token }, 'user', 204);
  await request('GET', '/users/me', null, 'user', 401);
  const secondPlan = await request('POST', '/study-plans', { title: 'Private', description: 'Delete safely' }, 'leader', 201);
  const secondLesson = await request('POST', `/study-plans/${secondPlan.id}/lessons`, { title: 'Private', position: 1 }, 'leader', 201);
  const privateQuestion = await request('POST', '/questions', {
    title: 'Private', body: 'Private', lesson_id: secondLesson.id
  }, 'leader', 201);
  const privateGroupSession = await request('POST', `/groups/${group.id}/sessions`, {
    title: 'Private lesson discussion', lesson_id: secondLesson.id, starts_at: '2026-11-01T12:00:00Z'
  }, 'leader', 201);
  const privateComment = await request('POST', '/comments', {
    body: 'Private lesson reflection', group_session_id: privateGroupSession.id
  }, 'leader', 201);
  await request('DELETE', `/study-plans/${secondPlan.id}`, null, 'leader', 204);
  assert.equal(await db.question.findUnique({ where: { id: privateQuestion.id } }), null);
  assert.equal(await db.groupSession.findUnique({ where: { id: privateGroupSession.id } }), null);
  assert.equal(await db.comment.findUnique({ where: { id: privateComment.id } }), null);
  await request('PATCH', `/admin/users/${tokens.leader.user.id}`, { status: 'suspended' }, 'admin');
  await request('GET', '/users/me', null, 'leader', 401);
  assert.equal(await db.adminAuditLog.count(), 2);
  const { PanorafusClient } = await import('../../frontend/client-examples/client.mjs');
  const client = new PanorafusClient(base + '/api/v1');
  const clientAuth = await client.register({ email: 'client@integration.example', password: 'Client-passphrase!123',
    display_name: 'Client learner' });
  await client.login('client@integration.example', 'Client-passphrase!123');
  client.accessToken = jwt.sign({ ver: 0 }, config.secret, {
    subject: clientAuth.user.id, issuer: config.issuer, audience: config.audience, expiresIn: -1
  });
  await client.logout();
  assert.equal(client.accessToken, null);
  assert.equal(client.refreshToken, null);
  const clientRefreshRows = await db.refreshToken.findMany({ where: { user_id: clientAuth.user.id } });
  assert.equal(clientRefreshRows.length, 3);
  assert.ok(clientRefreshRows.every(row => row.revoked_at));
});
