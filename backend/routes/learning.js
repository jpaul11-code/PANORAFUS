const { schemas, reading } = require('../models/schemas');
const { id, text, language, patch, parse } = require('../middleware/validation');
const { missing, ApiError } = require('../middleware/errors');
const { deleteContent } = require('../services/content');
function learningRoutes(router, db, resources, access) {
  const { list, one } = resources;
  router.get('/study-plans', (req, res) => list('studyPlan', req, res, filters => ({
    OR: [{ is_published: true }, { created_by: req.user.id }, ...(req.user.role === 'admin' ? [{}] : [])],
    ...(filters.language_code ? { language_code: filters.language_code } : {}),
    ...(filters.topic ? { topic: filters.topic } : {}),
    ...(filters.reading_level ? { reading_level: filters.reading_level } : {})
  }), { language_code: language.optional(), reading_level: reading.optional(), topic: text(100).optional() }));
  router.post('/study-plans', async (req, res) => {
    access.leadership(req.user);
    res.status(201).json(await db.studyPlan.create({ data: {
      ...parse(schemas.plan, req.body), created_by: req.user.id
    } }));
  });
  router.get('/study-plans/:id', async (req, res) => res.json(await access.plan(parse(id, req.params.id), req.user)));
  router.patch('/study-plans/:id', async (req, res) => {
    const resource_id = parse(id, req.params.id);
    await access.plan(resource_id, req.user, true);
    res.json(await db.studyPlan.update({ where: { id: resource_id }, data: parse(patch(schemas.plan), req.body) }));
  });
  router.delete('/study-plans/:id', async (req, res) => {
    const resource_id = parse(id, req.params.id);
    await access.plan(resource_id, req.user, true);
    await db.$transaction(tx => deleteContent(tx, 'studyPlan', resource_id));
    res.status(204).end();
  });
  router.get('/study-plans/:id/lessons', async (req, res) => {
    const plan_id = parse(id, req.params.id);
    await access.plan(plan_id, req.user);
    await list('studyLesson', req, res, { plan_id });
  });
  router.post('/study-plans/:id/lessons', async (req, res) => {
    const plan_id = parse(id, req.params.id);
    await access.plan(plan_id, req.user, true);
    res.status(201).json(await db.studyLesson.create({ data: { ...parse(schemas.lesson, req.body), plan_id } }));
  });
  router.get('/lessons', async (req, res) => {
    await list('studyLesson', req, res, async filters => {
      await access.plan(filters.plan_id, req.user);
      return { plan_id: filters.plan_id };
    }, { plan_id: id });
  });
  router.post('/lessons', async (req, res) => {
    const { plan_id, ...data } = parse(schemas.lesson.extend({ plan_id: id }), req.body);
    await access.plan(plan_id, req.user, true);
    res.status(201).json(await db.studyLesson.create({ data: { ...data, plan_id } }));
  });
  router.get('/lessons/:id', async (req, res) => res.json(await access.lesson(parse(id, req.params.id), req.user)));
  router.patch('/lessons/:id', async (req, res) => {
    const resource_id = parse(id, req.params.id);
    await access.lesson(resource_id, req.user, true);
    res.json(await db.studyLesson.update({ where: { id: resource_id }, data: parse(patch(schemas.lesson), req.body) }));
  });
  router.delete('/lessons/:id', async (req, res) => {
    const resource_id = parse(id, req.params.id);
    await access.lesson(resource_id, req.user, true);
    await db.$transaction(tx => deleteContent(tx, 'studyLesson', resource_id));
    res.status(204).end();
  });
  router.get('/lessons/:id/questions', async (req, res) => {
    const lesson_id = parse(id, req.params.id);
    await access.lesson(lesson_id, req.user);
    await list('question', req, res, { lesson_id });
  });
  router.get('/questions', (req, res) => list('question', req, res, async filters => {
    if (filters.lesson_id) {
      await access.lesson(filters.lesson_id, req.user);
      return { lesson_id: filters.lesson_id };
    }
    return { created_by: req.user.id, OR: [
      { lesson_id: null },
      { lesson: { plan: { OR: [
        { is_published: true }, { created_by: req.user.id }, ...(req.user.role === 'admin' ? [{}] : [])
      ] } } }
    ] };
  }, { lesson_id: id.optional() }));
  router.post('/questions', async (req, res) => {
    const data = parse(schemas.question, req.body);
    if (data.lesson_id) await access.lesson(data.lesson_id, req.user, true);
    if (data.passage_id) await one('biblePassage', data.passage_id);
    res.status(201).json(await db.question.create({ data: { ...data, created_by: req.user.id } }));
  });
  router.get('/questions/:id', async (req, res) => res.json(await access.question(parse(id, req.params.id), req.user)));
  router.get('/questions/:id/answers', async (req, res) => {
    const question_id = parse(id, req.params.id);
    await access.question(question_id, req.user);
    await list('answer', req, res, { question_id, created_by: req.user.id });
  });
  router.post('/questions/:id/answers', async (req, res) => {
    const question_id = parse(id, req.params.id);
    await access.question(question_id, req.user);
    res.status(201).json(await db.answer.create({ data: {
      ...parse(schemas.answer, req.body), question_id, created_by: req.user.id
    } }));
  });
  router.patch('/answers/:id', async (req, res) => {
    const resource_id = parse(id, req.params.id);
    const answer = await one('answer', resource_id);
    if (answer.created_by !== req.user.id) throw missing();
    await access.question(answer.question_id, req.user);
    res.json(await db.answer.update({ where: { id: resource_id }, data: parse(schemas.answer, req.body) }));
  });
  async function sessionReferences(data, req, previous) {
    const plan_id = data.plan_id || previous.plan_id;
    await access.plan(plan_id, req.user);
    if (data.group_id) await access.membership(data.group_id, req.user);
    const current = data.current_lesson_id;
    if (current) {
      const lesson = await access.lesson(current, req.user);
      if (lesson.plan_id !== plan_id) throw new ApiError(400, 'INVALID_REFERENCE', 'Lesson must belong to the study plan');
    }
    if (data.status === 'completed') {
      data.completed_at = new Date();
      if (!previous) data.started_at = data.completed_at;
    }
    else if (data.status) data.completed_at = null;
  }
  router.get('/study-sessions', (req, res) => list('studySession', req, res, {
    user_id: req.user.id, plan: { OR: [
      { is_published: true }, { created_by: req.user.id }, ...(req.user.role === 'admin' ? [{}] : [])
    ] }
  }));
  router.post('/study-sessions', async (req, res) => {
    const { study_plan_id, ...data } = parse(schemas.session, req.body);
    data.plan_id = study_plan_id;
    await sessionReferences(data, req);
    res.status(201).json(await db.studySession.create({ data: { ...data, user_id: req.user.id } }));
  });
  router.get('/study-sessions/:id', async (req, res) => {
    const row = await one('studySession', parse(id, req.params.id));
    if (row.user_id !== req.user.id) throw missing();
    await access.plan(row.plan_id, req.user);
    res.json(row);
  });
  router.patch('/study-sessions/:id', async (req, res) => {
    const resource_id = parse(id, req.params.id);
    const row = await one('studySession', resource_id);
    if (row.user_id !== req.user.id) throw missing();
    const data = parse(patch(schemas.sessionUpdate), req.body);
    await sessionReferences(data, req, row);
    res.json(await db.studySession.update({ where: { id: resource_id }, data }));
  });
  resources.privateCrud(router, '/journals', 'journal', schemas.journal, async (data, req) => {
    if (data.passage_reference && id.safeParse(data.passage_reference).success) {
      await one('biblePassage', data.passage_reference);
    }
    if (data.lesson_id) await access.lesson(data.lesson_id, req.user);
    if (data.session_id) {
      const session = await one('studySession', data.session_id);
      if (session.user_id !== req.user.id) throw missing();
      await access.plan(session.plan_id, req.user);
    }
  });
  resources.privateCrud(router, '/prayers', 'prayer', schemas.prayer, async (data, req, previous) => {
    if (data.group_id) await access.membership(data.group_id, req.user);
    if (data.answered_at && data.answered_at < (previous?.created_at || new Date())) {
      throw new ApiError(400, 'INVALID_ANSWERED_AT', 'answered_at must not precede the prayer creation time');
    }
    if (data.status === 'answered' && data.answered_at === undefined) {
      data.answered_at = new Date();
      if (!previous) data.created_at = data.answered_at;
    } else if (data.status === 'active' && data.answered_at === undefined) data.answered_at = null;
  });
}
module.exports = { learningRoutes };
