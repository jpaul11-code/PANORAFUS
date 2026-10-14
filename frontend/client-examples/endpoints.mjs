import { resourceId } from './client.mjs';

/**
 * Every learning API endpoint has a callable example here.
 * Pass validated form values as input; the server remains the security boundary.
 */
export function endpoints(client) {
  const get = (path, query) => client.request('GET', path, { query });
  const post = (path, body) => client.request('POST', path, { body });
  const patch = (path, body) => client.request('PATCH', path, { body });
  const remove = (path) => client.request('DELETE', path);
  const id = resourceId;
  const crud = (path) => ({
    list: (query) => get(path, query),
    create: (input) => post(path, input),
    get: (value) => get(`${path}/${id(value)}`),
    update: (value, input) => patch(`${path}/${id(value)}`, input),
    delete: (value) => remove(`${path}/${id(value)}`)
  });
  return {
    auth: {
      register: (input) => client.register(input),
      login: (email, password) => client.login(email, password),
      refresh: () => client.refresh(),
      logout: () => client.logout()
    },
    users: {
      me: () => get('/users/me'),
      updateMe: (input) => patch('/users/me', input),
      publicProfile: (value) => get(`/users/${id(value)}`)
    },
    bible: {
      books: (query) => get('/bible/books', query),
      book: (value) => get(`/bible/books/${id(value)}`),
      passages: (query) => get('/bible/passages', query),
      passage: (value) => get(`/bible/passages/${id(value)}`),
      search: (q, query = {}) => get('/bible/search', { ...query, q })
    },
    studyPlans: crud('/study-plans'),
    lessons: {
      list: (plan, query) => get(`/study-plans/${id(plan)}/lessons`, query),
      create: (plan, input) => post(`/study-plans/${id(plan)}/lessons`, input),
      listByPlan: (plan, query = {}) => get('/lessons', { ...query, plan_id: id(plan) }),
      createWithPlan: (input) => post('/lessons', input),
      get: (value) => get(`/lessons/${id(value)}`),
      update: (value, input) => patch(`/lessons/${id(value)}`, input),
      delete: (value) => remove(`/lessons/${id(value)}`),
      questions: (value, query) => get(`/lessons/${id(value)}/questions`, query)
    },
    questions: {
      list: (query) => get('/questions', query),
      create: (input) => post('/questions', input),
      get: (value) => get(`/questions/${id(value)}`),
      answer: (value, response_text) => post(`/questions/${id(value)}/answers`, { response_text }),
      answers: (value, query) => get(`/questions/${id(value)}/answers`, query),
      updateAnswer: (value, response_text) => patch(`/answers/${id(value)}`, { response_text })
    },
    studySessions: {
      list: (query) => get('/study-sessions', query),
      start: (input) => post('/study-sessions', input),
      get: (value) => get(`/study-sessions/${id(value)}`),
      update: (value, input) => patch(`/study-sessions/${id(value)}`, input)
    },
    journals: crud('/journals'),
    prayers: crud('/prayers'),
    groups: {
      ...crud('/groups'),
      members: (group, query) => get(`/groups/${id(group)}/members`, query),
      addMember: (group, input) => post(`/groups/${id(group)}/members`, input),
      removeMember: (group, user) => remove(`/groups/${id(group)}/members/${id(user)}`),
      sessions: (group, query) => get(`/groups/${id(group)}/sessions`, query),
      createSession: (group, input) => post(`/groups/${id(group)}/sessions`, input)
    },
    groupSessions: {
      get: (value) => get(`/group-sessions/${id(value)}`),
      update: (value, input) => patch(`/group-sessions/${id(value)}`, input)
    },
    comments: {
      list: (target_type, target_id, query = {}) => get('/comments', {
        ...query, target_type, target_id: id(target_id)
      }),
      create: (input) => post('/comments', input),
      update: (value, content) => patch(`/comments/${id(value)}`, { content }),
      delete: (value) => remove(`/comments/${id(value)}`)
    },
    notifications: {
      list: (query) => get('/notifications', query),
      markRead: (value) => patch(`/notifications/${id(value)}`, { is_read: true }),
      delete: (value) => remove(`/notifications/${id(value)}`),
      stream: (onEvent, options) => client.notifications(onEvent, options)
    },
    accessibility: {
      get: () => get('/accessibility-settings'),
      update: (input) => patch('/accessibility-settings', input)
    },
    languages: {
      list: (query) => get('/languages', query),
      create: (input) => post('/languages', input)
    },
    admin: {
      users: (query) => get('/admin/users', query),
      updateUser: (value, input) => patch(`/admin/users/${id(value)}`, input),
      auditLogs: (query) => get('/admin/audit-logs', query),
      moderate: (type, value) => {
        const types = ['study-plans', 'lessons', 'questions', 'answers', 'journals', 'prayers', 'groups', 'group-sessions', 'comments'];
        if (!types.includes(type)) throw new TypeError('Unsupported moderation target');
        return remove(`/admin/content/${type}/${id(value)}`);
      }
    },
    ai: {
      ask: (input) => post('/ai/ask', input),
      generateStudy: (input) => post('/ai/generate-study', input),
      generateQuestions: (input) => post('/ai/generate-questions', input),
      generatePrayer: (input) => post('/ai/generate-prayer', input)
    }
  };
}
