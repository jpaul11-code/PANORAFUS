const { schemas } = require('../models/schemas');
const { parse, patch, id, query } = require('../middleware/validation');
const { forbidden, ApiError } = require('../middleware/errors');
const { ownUser } = require('../models');
const { deleteContent } = require('../services/content');
const moderation = Object.freeze({
  'study-plans': 'studyPlan', lessons: 'studyLesson', questions: 'question', answers: 'answer',
  journals: 'journal', prayers: 'prayer', groups: 'group', 'group-sessions': 'groupSession', comments: 'comment'
});
function adminRoutes(router, db, resources) {
  router.use('/admin', (req, res, next) => {
    if (req.user.role !== 'admin') throw forbidden();
    next();
  });
  router.get('/admin/audit-logs', (req, res) => resources.list('adminAuditLog', req, res, {}, {}));
  router.get('/admin/users', async (req, res) => {
    const { limit, offset } = parse(query({}), req.query);
    const rows = await db.user.findMany({ take: limit, skip: offset, orderBy: { id: 'asc' }, include: { profile: true } });
    res.json({ items: rows.map(x => ({ ...ownUser(x), status: x.status })), limit, offset });
  });
  router.patch('/admin/users/:id', async (req, res) => {
    const user_id = parse(id, req.params.id);
    const data = parse(patch(schemas.adminUser), req.body);
    if (user_id === req.user.id && (data.role && data.role !== 'admin' || data.status === 'suspended')) {
      throw new ApiError(409, 'SELF_DEMOTION', 'Administrators cannot demote or suspend themselves');
    }
    const user = await db.$transaction(async tx => {
      const updated = await tx.user.update({ where: { id: user_id },
        data: { ...data, token_version: { increment: 1 } }, include: { profile: true } });
      await tx.refreshToken.updateMany({ where: { user_id }, data: { revoked_at: new Date() } });
      await tx.adminAuditLog.create({ data: { admin_id: req.user.id, action: 'update_user',
        entity_type: 'users', entity_id: user_id, details: data } });
      return updated;
    });
    res.json({ ...ownUser(user), status: user.status });
  });
  router.delete('/admin/content/:type/:id', async (req, res) => {
    const model = Object.hasOwn(moderation, req.params.type) ? moderation[req.params.type] : null;
    if (!model) throw new ApiError(400, 'INVALID_CONTENT_TYPE', 'Unsupported moderation content type');
    const resource_id = parse(id, req.params.id);
    await db.$transaction(async tx => {
      await deleteContent(tx, model, resource_id);
      await tx.adminAuditLog.create({ data: {
        admin_id: req.user.id, action: 'delete_content', entity_type: req.params.type,
        entity_id: resource_id, details: {}
      } });
    });
    res.status(204).end();
  });
}
module.exports = { adminRoutes, moderation };
