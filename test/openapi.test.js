'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

// JSON serialization is also valid YAML 1.2, without a runtime parser dependency.
const document = JSON.parse(fs.readFileSync(path.join(__dirname, '../docs/openapi.yaml'), 'utf8'));
const methods = new Set(['get', 'post', 'put', 'patch', 'delete']);
const operations = Object.entries(document.paths).flatMap(([route, item]) =>
  Object.entries(item).filter(([method]) => methods.has(method)).map(([method, operation]) => ({
    route, method, operation, item
  })));

function resolve(reference) {
  assert.match(reference, /^#\//, 'Only local, reproducible references are permitted');
  return reference.slice(2).split('/').reduce((value, key) => {
    assert.ok(value && Object.hasOwn(value, key), `Unresolved reference: ${reference}`);
    return value[key];
  }, document);
}

function walk(value, visit) {
  if (!value || typeof value !== 'object') return;
  visit(value);
  Object.values(value).forEach((child) => walk(child, visit));
}

test('OpenAPI contract has complete local references and unique operation IDs', () => {
  assert.equal(document.openapi, '3.0.3');
  assert.equal(document.servers[0].url, '/api/v1');
  const identifiers = new Set();
  walk(document, (value) => {
    if (value.$ref) resolve(value.$ref);
  });
  for (const { operation, route, method } of operations) {
    assert.ok(operation.operationId, `${method} ${route} needs an operation ID`);
    assert.ok(!identifiers.has(operation.operationId), `Duplicate operation ID: ${operation.operationId}`);
    identifiers.add(operation.operationId);
    assert.ok(operation.responses);
    assert.ok(operation.responses['500']);
  }
});

test('Every path placeholder is required and UUID identifiers are typed', () => {
  for (const { route, operation, item } of operations) {
    const placeholders = [...route.matchAll(/\{([^}]+)\}/g)].map((match) => match[1]);
    const parameters = [...(item.parameters || []), ...(operation.parameters || [])]
      .map((parameter) => parameter.$ref ? resolve(parameter.$ref) : parameter);
    assert.deepEqual(parameters.filter((parameter) => parameter.in === 'path').map((parameter) => parameter.name).sort(),
      [...placeholders].sort(), route);
    for (const name of placeholders) {
      const parameter = parameters.find((entry) => entry.in === 'path' && entry.name === name);
      assert.equal(parameter.required, true, `${route}: ${name}`);
      assert.ok(parameter.schema);
      if (name === 'id' || name.endsWith('_id')) assert.equal(parameter.schema.format, 'uuid', `${route}: ${name}`);
    }
  }
});

test('Security, strict bodies, pagination and reusable errors follow API policy', () => {
  assert.deepEqual(document.security, [{ bearerAuth: [] }]);
  assert.equal(document.components.securitySchemes.bearerAuth.scheme, 'bearer');
  assert.equal(document.components.securitySchemes.bearerAuth.bearerFormat, 'JWT');
  for (const { route, method, operation } of operations) {
    const publicRoute = ['/auth/register', '/auth/login', '/auth/refresh', '/health', '/ready'].includes(route)
      || route.startsWith('/bible/') || (route === '/languages' && method === 'get');
    assert.deepEqual(operation.security || document.security, publicRoute ? [] : [{ bearerAuth: [] }], route);
    if (operation.requestBody) {
      const body = operation.requestBody.$ref ? resolve(operation.requestBody.$ref) : operation.requestBody;
      const schemaRef = body.content['application/json'].schema;
      const schema = schemaRef.$ref ? resolve(schemaRef.$ref) : schemaRef;
      assert.equal(schema.additionalProperties, false, `${method} ${route} must reject unknown body fields`);
      if (method === 'patch' || method === 'put') assert.equal(schema.minProperties, 1, route);
    }
    for (const [status, response] of Object.entries(operation.responses)) {
      if (Number(status) >= 400) {
        assert.ok(response.$ref, `${route}: ${status} must reuse error responses`);
        const errorResponse = resolve(response.$ref);
        assert.equal(errorResponse.content['application/json'].schema.$ref, '#/components/schemas/Error');
        if (status === '429') assert.ok(errorResponse.headers['Retry-After']);
      }
      if (status === '204') assert.equal(response.content, undefined);
    }
    if (method === 'delete') assert.ok(operation.responses['204'], route);
  }
  assert.deepEqual(document.components.schemas.Error.required, ['error']);
  assert.deepEqual(document.components.schemas.Error.properties.error.required, ['code', 'message', 'request_id']);
  assert.equal(document.components.parameters.Limit.schema.maximum, 100);
  assert.equal(document.components.parameters.Offset.schema.minimum, 0);
  assert.doesNotMatch(JSON.stringify(document), /password_hash|refresh_token_hash|refresh_hash/);
});

test('Original design operations and the six implemented additions are all present', () => {
  const design = {
    auth: ['post /auth/register', 'post /auth/login', 'post /auth/refresh', 'post /auth/logout'],
    users: ['get /users/me', 'patch /users/me', 'get /users/{id}'],
    bible: ['get /bible/books', 'get /bible/books/{id}', 'get /bible/passages',
      'get /bible/passages/{id}', 'get /bible/search'],
    plans: ['get /study-plans', 'post /study-plans', 'get /study-plans/{id}',
      'patch /study-plans/{id}', 'delete /study-plans/{id}'],
    lessons: ['get /study-plans/{id}/lessons', 'post /study-plans/{id}/lessons',
      'get /lessons/{id}', 'patch /lessons/{id}', 'delete /lessons/{id}'],
    questions: ['post /questions', 'get /questions/{id}', 'get /lessons/{id}/questions',
      'get /questions/{id}/answers', 'post /questions/{id}/answers', 'patch /answers/{id}'],
    study_sessions: ['get /study-sessions', 'post /study-sessions',
      'get /study-sessions/{id}', 'patch /study-sessions/{id}'],
    journals: ['get /journals', 'post /journals', 'get /journals/{id}',
      'patch /journals/{id}', 'delete /journals/{id}'],
    prayers: ['get /prayers', 'post /prayers', 'get /prayers/{id}',
      'patch /prayers/{id}', 'delete /prayers/{id}'],
    groups: ['get /groups', 'post /groups', 'get /groups/{id}',
      'patch /groups/{id}', 'delete /groups/{id}'],
    members: ['get /groups/{id}/members', 'post /groups/{id}/members',
      'delete /groups/{id}/members/{user_id}'],
    group_sessions: ['get /groups/{id}/sessions', 'post /groups/{id}/sessions',
      'get /group-sessions/{id}', 'patch /group-sessions/{id}'],
    comments: ['get /comments', 'post /comments', 'patch /comments/{id}', 'delete /comments/{id}'],
    notifications: ['get /notifications', 'patch /notifications/{id}', 'delete /notifications/{id}'],
    accessibility: ['get /accessibility-settings', 'patch /accessibility-settings'],
    languages: ['get /languages', 'post /languages'],
    admin: ['get /admin/users', 'patch /admin/users/{id}', 'get /admin/audit-logs',
      'delete /admin/content/{type}/{id}'],
    ai: ['post /ai/ask', 'post /ai/generate-study', 'post /ai/generate-questions', 'post /ai/generate-prayer']
  };
  const additions = ['get /notifications/stream', 'get /health', 'get /ready',
    'get /lessons', 'post /lessons', 'get /questions'];
  const original = Object.values(design).flat();
  assert.equal(original.length, 73);
  const expected = [...original, ...additions].sort();
  assert.equal(new Set(expected).size, 79);
  assert.deepEqual(operations.map(({ route, method }) => `${method} ${route}`).sort(), expected);
});

test('Documented operations exactly cover implemented route registrations', () => {
  const root = path.join(__dirname, '../backend');
  const registered = new Set();
  const normalize = (route) => route.replace(/:([a-z_]+)/g, '{$1}');
  const add = (method, route) => registered.add(`${method} ${normalize(route)}`);
  const files = fs.readdirSync(path.join(root, 'routes')).filter((file) => file.endsWith('.js'));
  for (const file of files) {
    const source = fs.readFileSync(path.join(root, 'routes', file), 'utf8');
    for (const match of source.matchAll(/router\.(get|post|patch|delete)\('([^']+)'/g)) {
      add(match[1], match[2]);
    }
    for (const match of source.matchAll(/resources\.privateCrud\(router, '([^']+)'/g)) {
      for (const method of ['get', 'post']) add(method, match[1]);
      for (const method of ['get', 'patch', 'delete']) add(method, `${match[1]}/:id`);
    }
    if (source.includes('router.post(`/ai/${operation}`')) {
      for (const operation of ['ask', 'generate-study', 'generate-questions', 'generate-prayer']) {
        add('post', `/ai/${operation}`);
      }
    }
  }
  const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  for (const match of app.matchAll(/app\.(get|post|patch|delete)\('([^']+)'/g)) {
    add(match[1], match[2]);
  }
  assert.deepEqual(operations.map(({ route, method }) => `${method} ${route}`).sort(),
    [...registered].sort(), 'No undocumented implemented routes or invented operations');
});

test('Resource and AI schemas plus authenticated SSE are documented', () => {
  const resources = ['User', 'Profile', 'BibleBook', 'BiblePassage', 'StudyPlan', 'StudyLesson',
    'Question', 'Answer', 'StudySession', 'Journal', 'Prayer', 'Group', 'GroupMember', 'GroupSession',
    'Comment', 'Notification', 'Language', 'AccessibilitySettings', 'AdminAuditLog'];
  for (const resource of resources) {
    const schema = document.components.schemas[resource];
    assert.ok(schema, resource);
    assert.equal(schema.type, 'object', resource);
    assert.ok(Object.keys(schema.properties).length > 1, resource);
  }
  const output = document.components.schemas.AIResponse;
  for (const field of ['answer', 'scripture_references', 'reflection_question']) {
    assert.ok(output.required.includes(field), field);
  }
  assert.ok(output.properties.next_step);
  const stream = document.paths['/notifications/stream'].get;
  assert.ok(stream.responses['200'].content['text/event-stream']);
  assert.match(stream.description, /fetch/i);
  assert.match(stream.description, /Authorization/);
  assert.match(stream.description, /EventSource/);
  for (const route of ['/health', '/ready']) {
    assert.deepEqual(document.paths[route].servers, [{ url: '/' }]);
  }
});

test('Authentication contracts never expose stored credentials and constrain inputs', () => {
  const schemas = document.components.schemas;
  assert.deepEqual(schemas.RegisterRequest.required, ['full_name', 'email', 'password', 'preferred_language']);
  for (const name of ['RegisterRequest', 'LoginRequest']) {
    assert.equal(schemas[name].properties.password.minLength, 12);
    assert.equal(schemas[name].properties.password.maxLength, 128);
    assert.equal(schemas[name].properties.password.writeOnly, true);
  }
  assert.deepEqual(schemas.RefreshRequest.required, ['refresh_token']);
  for (const route of ['/auth/refresh', '/auth/logout']) {
    assert.equal(document.paths[route].post.requestBody.content['application/json'].schema.$ref,
      '#/components/schemas/RefreshRequest');
  }
  assert.ok(document.paths['/auth/register'].post.responses['201']);
  assert.ok(document.paths['/auth/login'].post.responses['200']);
  assert.ok(document.paths['/auth/refresh'].post.responses['200']);
  assert.match(document.paths['/auth/logout'].post.description, /first call the public refresh endpoint/);
  assert.match(document.paths['/auth/logout'].post.description, /newly rotated refresh_token/);
  for (const { route, method, operation } of operations) {
    if (route.startsWith('/ai/')) {
      assert.equal(method, 'post');
      assert.ok(operation.responses['200']);
      assert.ok(!operation.responses['201']);
    }
  }
  walk(schemas, (schema) => {
    if (schema.required && schema.properties) {
      for (const field of schema.required) assert.ok(Object.hasOwn(schema.properties, field), field);
    }
    if (schema.type === 'array') assert.ok(schema.items, 'Every array has a typed element schema');
    if (schema.properties) {
      for (const field of Object.keys(schema.properties)) {
        assert.match(field, /^[a-z][a-z0-9_]*$/, `Wire properties must be snake_case: ${field}`);
        assert.ok(!field.endsWith('_hash'), 'Stored credential hashes cannot be exposed');
      }
    }
  });
});

test('Persisted resource schemas cover scalar columns and nullable UUIDs', () => {
  const prisma = fs.readFileSync(path.join(__dirname, '../prisma/schema.prisma'), 'utf8');
  const types = { String: 'string', Int: 'integer', Boolean: 'boolean', DateTime: 'string' };
  for (const match of prisma.matchAll(/model (\w+) \{([\s\S]*?)^\}/gm)) {
    const [ , name, model ] = match;
    // Account responses use an explicit safe projection, unlike persisted resources.
    if (['User', 'RefreshToken', 'LessonPassage'].includes(name)) continue;
    const resource = document.components.schemas[name];
    assert.ok(resource, `Missing resource schema: ${name}`);
    for (const field of model.matchAll(/^\s+(\w+)\s+(String|Int|Boolean|DateTime)(\?)?(\s+.*)?$/gm)) {
      const [ , property, type, nullable, annotations ] = field;
      let schema = resource.properties[property];
      assert.ok(schema, `${name}.${property}`);
      if (schema.$ref) schema = resolve(schema.$ref);
      assert.equal(schema.type, types[type], `${name}.${property}: type`);
      if (nullable) assert.equal(schema.nullable, true, `${name}.${property}: nullable`);
      if (type === 'String' && annotations?.includes('@db.Uuid')) {
        assert.equal(schema.format, 'uuid', `${name}.${property}: UUID`);
      }
      if (type === 'DateTime') assert.equal(schema.format, 'date-time', `${name}.${property}: date-time`);
    }
  }
});

test('Safe user projections match documented response fields', () => {
  const { publicUser, ownUser } = require('../backend/models');
  const timestamp = '2026-01-01T00:00:00.000Z';
  const account = {
    id: '123e4567-e89b-42d3-a456-426614174000', email: 'reader@example.test', role: 'user',
    status: 'active', email_verified: false, password_hash: 'not-a-real-credential', token_version: 0,
    created_at: timestamp, updated_at: timestamp,
    profile: {
      id: '123e4567-e89b-42d3-a456-426614174001', user_id: '123e4567-e89b-42d3-a456-426614174000',
      display_name: 'Reader', bio: null, avatar_url: null, reading_level: 'beginner',
      language_code: 'en', is_public: true, created_at: '2026-02-01T00:00:00.000Z',
      updated_at: '2026-02-02T00:00:00.000Z', church_name: 'Private metadata',
      denomination: 'Private metadata', study_goal: 'Private metadata',
      location: 'Private metadata', timezone: 'UTC'
    }
  };
  for (const [name, projection] of [['User', ownUser(account)], ['PublicUser', publicUser(account)]]) {
    assert.equal(projection.id, account.id, 'Profile ID must not overwrite the account ID');
    assert.equal(projection.created_at, account.created_at, 'Profile timestamp must not overwrite account creation time');
    const schema = document.components.schemas[name];
    for (const field of Object.keys(projection)) assert.ok(schema.properties[field], `${name}.${field}`);
    for (const field of schema.required) assert.ok(Object.hasOwn(projection, field), `${name}.${field}`);
    assert.ok(!Object.hasOwn(projection, 'password_hash'));
    assert.ok(!Object.hasOwn(projection, 'token_version'));
  }
  assert.equal(ownUser(account).updated_at, account.updated_at);
  const publicProjection = publicUser(account);
  assert.deepEqual(Object.keys(document.components.schemas.PublicUser.properties).sort(),
    Object.keys(publicProjection).sort());
  for (const field of ['email', 'updated_at', 'church_name', 'denomination', 'study_goal', 'location', 'timezone']) {
    assert.ok(!Object.hasOwn(publicProjection, field), `${field} cannot be exposed publicly`);
    assert.ok(!Object.hasOwn(document.components.schemas.PublicUser.properties, field), `${field} cannot be documented publicly`);
  }
});

let backendSchemas;
let hasBackendDependencies = false;
try {
  require.resolve('zod', { paths: [path.join(__dirname, '../backend')] });
  hasBackendDependencies = true;
} catch (error) {
  if (error.code !== 'MODULE_NOT_FOUND') throw error;
}
if (hasBackendDependencies) backendSchemas = require('../backend/models/schemas');

test('Bible verse filtering matches the documented bounds and inclusive passage range', {
  skip: hasBackendDependencies ? false : 'Install backend dependencies to verify query behavior'
}, async () => {
  const { createApp } = require('../backend/app');
  const queried = [];
  const app = createApp({
    config: { origins: [] },
    db: { biblePassage: { async findMany({ where }) { queried.push(where); return []; } } }
  });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  try {
    const base = `http://127.0.0.1:${server.address().port}/api/v1/bible/passages`;
    const book = '123e4567-e89b-42d3-a456-426614174000';
    const response = await fetch(`${base}?book_id=${book}&chapter=3&verse=7`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { items: [], limit: 20, offset: 0 });
    assert.deepEqual(queried[0], {
      book_id: book, chapter: 3, verse_start: { lte: 7 }, verse_end: { gte: 7 }
    });
    const bounds = document.components.parameters.VerseFilter.schema;
    for (const verse of [bounds.minimum - 1, bounds.maximum + 1]) {
      const invalid = await fetch(`${base}?verse=${verse}`);
      assert.equal(invalid.status, 400, `Out-of-range verse ${verse}`);
      const error = await invalid.json();
      assert.equal(error.error.code, 'VALIDATION_ERROR');
      assert.ok(error.error.request_id);
    }
    assert.equal(queried.length, 1, 'Invalid queries must never reach the database');
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test('Request fields and bounds match backend validators', {
  skip: backendSchemas ? false : 'Install backend dependencies to compare live validators'
}, () => {
  const { z, patch, id } = require('../backend/middleware/validation');
  const { schemas } = backendSchemas;
  const pairs = {
    RegisterRequest: schemas.register, LoginRequest: schemas.login, RefreshRequest: schemas.refresh,
    ProfileUpdate: patch(schemas.profile), StudyPlanCreate: schemas.plan, StudyPlanUpdate: patch(schemas.plan),
    StudyLessonCreate: schemas.lesson, StandaloneLessonCreate: schemas.lesson.extend({ plan_id: id }),
    StudyLessonUpdate: patch(schemas.lesson), QuestionCreate: schemas.question,
    AnswerCreate: schemas.answer, AnswerUpdate: schemas.answer,
    StudySessionCreate: schemas.session, StudySessionUpdate: patch(schemas.sessionUpdate),
    JournalCreate: schemas.journal, JournalUpdate: patch(schemas.journal),
    PrayerCreate: schemas.prayer, PrayerUpdate: patch(schemas.prayer),
    GroupCreate: schemas.group, GroupUpdate: patch(schemas.group),
    GroupMemberCreate: schemas.member, GroupSessionCreate: schemas.groupSession,
    GroupSessionUpdate: patch(schemas.groupSession), CommentCreate: schemas.comment,
    CommentUpdate: schemas.commentUpdate, NotificationUpdate: schemas.notification,
    AccessibilityUpdate: patch(schemas.accessibility), LanguageCreate: schemas.language,
    AdminUserUpdate: patch(schemas.adminUser)
  };
  const { inputs, outputs } = require('../backend/services/ai');
  Object.assign(pairs, {
    AIAskRequest: inputs.ask, AIStudyRequest: inputs['generate-study'],
    AIQuestionsRequest: inputs['generate-questions'], AIPrayerRequest: inputs['generate-prayer'],
    AIResponse: outputs.ask, AIStudyResponse: outputs['generate-study'],
    AIQuestionsResponse: outputs['generate-questions'], AIPrayerResponse: outputs['generate-prayer']
  });
  function compare(documented, actual, location) {
    if (documented.$ref) documented = resolve(documented.$ref);
    if (actual.anyOf) {
      const nonNull = actual.anyOf.find((entry) => entry.type !== 'null');
      if (actual.anyOf.some((entry) => entry.type === 'null')) assert.equal(documented.nullable, true, location);
      actual = nonNull;
    }
    if (actual.type) assert.equal(documented.type, actual.type, `${location}: type`);
    if (actual.properties) {
      assert.deepEqual(Object.keys(documented.properties).sort(), Object.keys(actual.properties).sort(), location);
      assert.deepEqual([...(documented.required || [])].sort(), [...(actual.required || [])].sort(),
        `${location}: required fields`);
      assert.equal(documented.additionalProperties, actual.additionalProperties, location);
      for (const field of Object.keys(actual.properties)) {
        compare(documented.properties[field], actual.properties[field], `${location}.${field}`);
      }
    }
    for (const constraint of ['minimum', 'maximum', 'minLength', 'maxLength', 'minItems', 'maxItems']) {
      if (actual[constraint] !== undefined) assert.equal(documented[constraint], actual[constraint],
        `${location}: ${constraint}`);
    }
    if (actual.enum) assert.deepEqual([...documented.enum].sort(), [...actual.enum].sort(), location);
    if (actual.items) compare(documented.items, actual.items, `${location}[]`);
  }
  const mismatches = [];
  for (const [name, schema] of Object.entries(pairs)) {
    try {
      compare(document.components.schemas[name], z.toJSONSchema(schema, { io: 'input' }), name);
    } catch (error) {
      mismatches.push(`${name}: ${error.message.split('\n')[0]} (${JSON.stringify(error.actual)} != ${JSON.stringify(error.expected)})`);
    }
  }
  assert.deepEqual(mismatches, [], 'Documented schemas must match every live backend validator');
});
