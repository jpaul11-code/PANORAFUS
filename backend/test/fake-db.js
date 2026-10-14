const { randomUUID } = require('node:crypto');
const names = ['user', 'profile', 'refreshToken', 'language', 'accessibilitySettings', 'bibleBook',
  'biblePassage', 'studyPlan', 'studyLesson', 'question', 'answer', 'studySession', 'journal', 'prayer',
  'group', 'groupMember', 'groupSession', 'comment', 'notification', 'adminAuditLog'];
function fakeDatabase() {
  const tables = Object.fromEntries(names.map(x => [x, []]));
  let failure;
  const db = { tables, fail(model, operation, error = new Error('private database failure')) {
    failure = { model, operation, error };
  }, $queryRaw: async () => [{ '?column?': 1 }] };
  function relation(model, row, key) {
    if (['studyLesson', 'studySession'].includes(model) && key === 'plan') return tables.studyPlan.find(x => x.id === row.plan_id);
    if (model === 'question' && key === 'lesson') return tables.studyLesson.find(x => x.id === row.lesson_id);
    if (model === 'groupSession' && key === 'lesson') return tables.studyLesson.find(x => x.id === row.lesson_id);
    if (model === 'group' && key === 'members') return tables.groupMember.filter(x => x.group_id === row.id);
  }
  function match(model, row, where = {}) {
    return Object.entries(where).every(([key, value]) => {
      if (value === undefined) return true;
      if (key === 'OR') return value.some(x => match(model, row, x));
      if (key === 'AND') return value.every(x => match(model, row, x));
      if (key === 'group_id_user_id') return match(model, row, value);
      const related = relation(model, row, key);
      if (related !== undefined) {
        if (Array.isArray(related)) return related.some(x => match('groupMember', x, value.some));
        return match(key === 'plan' ? 'studyPlan' : 'studyLesson', related, value);
      }
      const actual = row[key] ?? null;
      if (value && typeof value === 'object' && !(value instanceof Date)) {
        if ('gt' in value && !(actual > value.gt)) return false;
        if ('contains' in value && !String(actual).toLowerCase().includes(value.contains.toLowerCase())) return false;
        if ('in' in value && !value.in.includes(actual)) return false;
        if ('not' in value && actual === value.not) return false;
        return true;
      }
      return actual instanceof Date && value instanceof Date ? +actual === +value : actual === value;
    });
  }
  function include(model, row, options) {
    if (!row) return null;
    const clone = structuredClone(row);
    if (model === 'user' && options?.profile) clone.profile = structuredClone(tables.profile.find(x => x.user_id === row.id) || null);
    return clone;
  }
  function defaults(model) {
    const common = { id: randomUUID(), created_at: new Date(), updated_at: new Date() };
    const byModel = {
      user: { role: 'user', status: 'active', token_version: 0, email_verified: false },
      profile: { language_code: 'en', reading_level: 'beginner', is_public: false, bio: null, avatar_url: null },
      refreshToken: { used_at: null, revoked_at: null }, language: { is_active: true },
      studyPlan: { is_published: false, reading_level: 'beginner', language_code: 'en' },
      studyLesson: { description: '', content: '', reflection_prompt: '' },
      question: { lesson_id: null, passage_id: null }, answer: { is_accepted: false },
      studySession: { group_id: null, current_lesson_id: null, status: 'active', completed_at: null, started_at: new Date() },
      journal: { session_id: null, lesson_id: null, is_private: true },
      prayer: { group_id: null, is_private: true, status: 'active' },
      group: { description: '', visibility: 'private' }, groupMember: { role: 'member' },
      groupSession: { lesson_id: null, ends_at: null }, comment: { question_id: null, lesson_id: null, group_session_id: null },
      notification: { is_read: false, data: {} },
      accessibilitySettings: { font_size: 16, high_contrast: false, reduce_motion: false, screen_reader: false }
    };
    return { ...common, ...byModel[model] };
  }
  function checkFailure(model, operation) {
    if (failure?.model === model && failure.operation === operation) {
      const error = failure.error; failure = null; throw error;
    }
  }
  for (const model of names) {
    db[model] = {
      async findUnique(args) {
        checkFailure(model, 'findUnique');
        return include(model, tables[model].find(x => match(model, x, args.where)), args.include);
      },
      async findFirst(args) { return this.findUnique(args); },
      async findMany(args = {}) {
        checkFailure(model, 'findMany');
        let rows = tables[model].filter(x => match(model, x, args.where));
        if (args.orderBy) {
          const orders = Array.isArray(args.orderBy) ? args.orderBy : [args.orderBy];
          rows.sort((a, b) => {
            for (const order of orders) {
              const [key, direction] = Object.entries(order)[0];
              const delta = a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : 0;
              if (delta) return direction === 'asc' ? delta : -delta;
            }
            return 0;
          });
        }
        return rows.slice(args.skip || 0, (args.skip || 0) + (args.take || rows.length)).map(x => include(model, x, args.include));
      },
      async create(args) {
        checkFailure(model, 'create');
        const data = structuredClone(args.data);
        const unique = { user: 'email', language: 'code', refreshToken: 'token_hash', profile: 'user_id', accessibilitySettings: 'user_id' }[model];
        if (unique && tables[model].some(x => x[unique] === data[unique])) throw Object.assign(new Error('duplicate'), { code: 'P2002' });
        if (model === 'groupMember' && tables[model].some(x => x.group_id === data.group_id && x.user_id === data.user_id)) {
          throw Object.assign(new Error('duplicate'), { code: 'P2002' });
        }
        const profile = data.profile; const settings = data.accessibility_settings; const members = data.members;
        delete data.profile; delete data.accessibility_settings; delete data.members;
        const row = { ...defaults(model), ...data };
        tables[model].push(row);
        if (profile) await db.profile.create({ data: { ...profile.create, user_id: row.id } });
        if (settings) await db.accessibilitySettings.create({ data: { ...settings.create, user_id: row.id } });
        if (members) await db.groupMember.create({ data: { ...members.create, group_id: row.id } });
        return include(model, row, args.include);
      },
      async update(args) {
        checkFailure(model, 'update');
        const row = tables[model].find(x => match(model, x, args.where));
        if (!row) throw Object.assign(new Error('missing'), { code: 'P2025' });
        for (const [key, value] of Object.entries(args.data)) {
          row[key] = value && typeof value === 'object' && 'increment' in value ? row[key] + value.increment : structuredClone(value);
        }
        row.updated_at = new Date();
        return include(model, row, args.include);
      },
      async updateMany(args) {
        checkFailure(model, 'updateMany');
        const rows = tables[model].filter(x => match(model, x, args.where));
        for (const row of rows) await this.update({ where: { id: row.id }, data: args.data });
        return { count: rows.length };
      },
      async delete(args) {
        checkFailure(model, 'delete');
        const index = tables[model].findIndex(x => match(model, x, args.where));
        if (index === -1) throw Object.assign(new Error('missing'), { code: 'P2025' });
        return tables[model].splice(index, 1)[0];
      },
      async deleteMany(args) {
        checkFailure(model, 'deleteMany');
        const rows = tables[model].filter(x => match(model, x, args.where));
        for (const row of rows) await this.delete({ where: { id: row.id } });
        return { count: rows.length };
      },
      async upsert(args) {
        return await this.findUnique({ where: args.where })
          ? this.update({ where: args.where, data: args.update }) : this.create({ data: args.create });
      }
    };
  }
  let tail = Promise.resolve();
  db.$transaction = callback => {
    const job = tail.then(async () => {
      const snapshot = structuredClone(tables);
      try { return await callback(db); }
      catch (error) { for (const name of names) tables[name] = snapshot[name]; throw error; }
    });
    tail = job.catch(() => {});
    return job;
  };
  return db;
}
module.exports = { fakeDatabase };
