const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID, randomBytes } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { createApp } = require('../app');
const { loadConfig } = require('../config');
const { authService } = require('../services/auth');

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
  url.searchParams.set('schema', schema);
  execFileSync(process.execPath, [
    path.resolve(__dirname, '../node_modules/prisma/build/index.js'), 'db', 'push',
    '--schema', path.resolve(__dirname, '../../prisma/schema.prisma'), '--skip-generate'
  ], { cwd: path.resolve(__dirname, '..'), env: { ...process.env, DATABASE_URL: url.href }, stdio: 'pipe' });
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
      email: `${actor}@integration.example`, password: 'Integration-passphrase!123', display_name: actor
    }, null, 201);
    if (actor === 'leader' || actor === 'admin') {
      const user = await db.user.update({ where: { id: tokens[actor].user.id },
        data: { role: actor }, include: { profile: true } });
      tokens[actor] = await auth.issue(db, user);
    }
  }
  const plan = await request('POST', '/study-plans', { title: 'Hope', description: 'A private study' }, 'leader', 201);
  const lesson = await request('POST', `/study-plans/${plan.id}/lessons`, { title: 'Romans', position: 1 }, 'leader', 201);
  const question = await request('POST', '/questions', { title: 'Why?', body: 'Reflect', lesson_id: lesson.id }, 'leader', 201);
  await request('GET', `/questions/${question.id}`, null, 'user', 404);
  await request('PATCH', `/study-plans/${plan.id}`, { is_published: true }, 'leader');
  const answer = await request('POST', `/questions/${question.id}/answers`, { body: 'Private answer' }, 'user', 201);
  assert.equal((await request('GET', `/questions/${question.id}/answers`, null, 'other')).items.length, 0);
  await request('PATCH', `/answers/${answer.id}`, { body: 'Edited answer' }, 'user');
  const session = await request('POST', '/study-sessions', { plan_id: plan.id, current_lesson_id: lesson.id }, 'user', 201);
  await request('GET', '/study-sessions', null, 'user');
  const journal = await request('POST', '/journals', { title: 'Reflection', body: 'Private',
    session_id: session.id, lesson_id: lesson.id }, 'user', 201);
  await request('GET', `/journals/${journal.id}`, null, 'admin', 404);
  const group = await request('POST', '/groups', { name: 'Group' }, 'leader', 201);
  await request('POST', `/groups/${group.id}/members`, { user_id: tokens.user.user.id }, 'leader', 201);
  const groupSession = await request('POST', `/groups/${group.id}/sessions`, {
    title: 'Study', lesson_id: lesson.id, starts_at: '2026-11-01T12:00:00Z'
  }, 'leader', 201);
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
});
