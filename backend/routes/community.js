const { schemas } = require('../models/schemas');
const { id, query, parse, patch } = require('../middleware/validation');
const { forbidden, ApiError } = require('../middleware/errors');
function communityRoutes(router, db, resources, access) {
  const { one, list } = resources;
  router.get('/groups', (req, res) => list('group', req, res, {
    OR: [{ visibility: 'public' }, { leader_id: req.user.id }, { members: { some: { user_id: req.user.id } } }]
  }));
  router.post('/groups', async (req, res) => {
    access.leadership(req.user);
    res.status(201).json(await db.group.create({ data: {
      ...parse(schemas.group, req.body), leader_id: req.user.id,
      members: { create: { user_id: req.user.id, role: 'leader' } }
    } }));
  });
  router.get('/groups/:id', async (req, res) => res.json(await access.group(parse(id, req.params.id), req.user)));
  router.patch('/groups/:id', async (req, res) => {
    const resource_id = parse(id, req.params.id);
    await access.group(resource_id, req.user, true);
    res.json(await db.group.update({ where: { id: resource_id }, data: parse(patch(schemas.group), req.body) }));
  });
  router.delete('/groups/:id', async (req, res) => {
    const resource_id = parse(id, req.params.id);
    await access.group(resource_id, req.user, true);
    await db.group.delete({ where: { id: resource_id } });
    res.status(204).end();
  });
  router.get('/groups/:id/members', async (req, res) => {
    const group_id = parse(id, req.params.id);
    await access.membership(group_id, req.user);
    await list('groupMember', req, res, { group_id });
  });
  router.post('/groups/:id/members', async (req, res) => {
    const group_id = parse(id, req.params.id);
    await access.group(group_id, req.user, true);
    const { user_id } = parse(schemas.member, req.body);
    const target = await one('user', user_id);
    if (target.status !== 'active') throw new ApiError(400, 'INVALID_MEMBER', 'User is unavailable');
    if (user_id === req.user.id) throw forbidden();
    res.status(201).json(await db.groupMember.create({ data: { group_id, user_id, role: 'member' } }));
  });
  router.delete('/groups/:id/members/:user_id', async (req, res) => {
    const group_id = parse(id, req.params.id);
    const user_id = parse(id, req.params.user_id);
    const group = await access.group(group_id, req.user, true);
    if (user_id === group.leader_id) throw new ApiError(409, 'GROUP_LEADER', 'The group leader cannot be removed');
    await db.groupMember.delete({ where: { group_id_user_id: { group_id, user_id } } });
    res.status(204).end();
  });
  router.get('/groups/:id/sessions', async (req, res) => {
    const group_id = parse(id, req.params.id);
    await access.membership(group_id, req.user);
    await list('groupSession', req, res, {
      group_id, OR: [{ lesson_id: null }, { lesson: { plan: {
        OR: [{ is_published: true }, { created_by: req.user.id }, ...(req.user.role === 'admin' ? [{}] : [])]
      } } }]
    });
  });
  async function sessionData(data, req, previous) {
    if (data.lesson_id) await access.lesson(data.lesson_id, req.user);
    const start = data.starts_at || previous?.starts_at;
    const end = data.ends_at === undefined ? previous?.ends_at : data.ends_at;
    if (end && end <= start) throw new ApiError(400, 'VALIDATION_ERROR', 'ends_at must be after starts_at');
    return data;
  }
  router.post('/groups/:id/sessions', async (req, res) => {
    const group_id = parse(id, req.params.id);
    await access.group(group_id, req.user, true);
    const data = await sessionData(parse(schemas.groupSession, req.body), req);
    res.status(201).json(await db.groupSession.create({ data: { ...data, group_id, created_by: req.user.id } }));
  });
  router.get('/group-sessions/:id', async (req, res) => res.json(await access.groupSession(parse(id, req.params.id), req.user)));
  router.patch('/group-sessions/:id', async (req, res) => {
    const resource_id = parse(id, req.params.id);
    const row = await access.groupSession(resource_id, req.user, true);
    const data = await sessionData(parse(patch(schemas.groupSession), req.body), req, row);
    res.json(await db.groupSession.update({ where: { id: resource_id }, data }));
  });
  router.get('/comments', async (req, res) => {
    const values = parse(query({
      question_id: id.optional(), lesson_id: id.optional(), group_session_id: id.optional()
    }).refine(x => ['question_id', 'lesson_id', 'group_session_id'].filter(k => x[k]).length === 1,
      'Exactly one parent is required'), req.query);
    const { limit, offset, ...where } = values;
    await access.commentParent(where, req.user);
    res.json({ items: await db.comment.findMany({ where, take: limit, skip: offset, orderBy: { id: 'asc' } }), limit, offset });
  });
  router.post('/comments', async (req, res) => {
    const data = parse(schemas.comment, req.body);
    await access.commentParent(data, req.user);
    res.status(201).json(await db.comment.create({ data: { ...data, created_by: req.user.id } }));
  });
  router.patch('/comments/:id', async (req, res) => {
    const resource_id = parse(id, req.params.id);
    const row = await one('comment', resource_id);
    await access.commentParent(row, req.user);
    if (row.created_by !== req.user.id) throw forbidden();
    res.json(await db.comment.update({ where: { id: resource_id }, data: parse(schemas.commentUpdate, req.body) }));
  });
  router.delete('/comments/:id', async (req, res) => {
    const resource_id = parse(id, req.params.id);
    const row = await one('comment', resource_id);
    await access.commentParent(row, req.user);
    if (row.created_by !== req.user.id) throw forbidden();
    await db.comment.delete({ where: { id: resource_id } });
    res.status(204).end();
  });
}
module.exports = { communityRoutes };
