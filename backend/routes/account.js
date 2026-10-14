const { schemas } = require('../models/schemas');
const { publicUser, ownUser } = require('../models');
const { parse, patch, id } = require('../middleware/validation');
const { missing, forbidden } = require('../middleware/errors');
const { notificationStream } = require('../services/notifications');
function accountRoutes(router, db, resources, auth, config) {
  router.post('/auth/logout', async (req, res) => {
    const data = parse(schemas.refresh, req.body);
    await auth.logout(req.user, data.refresh_token);
    res.status(204).end();
  });
  router.get('/users/me', (req, res) => res.json(ownUser(req.user)));
  router.patch('/users/me', async (req, res) => {
    const data = parse(patch(schemas.profile), req.body);
    await db.profile.update({ where: { user_id: req.user.id }, data });
    res.json(ownUser(await db.user.findUnique({ where: { id: req.user.id }, include: { profile: true } })));
  });
  router.get('/users/:id', async (req, res) => {
    const user = await db.user.findUnique({ where: { id: parse(id, req.params.id) }, include: { profile: true } });
    if (!user || !user.profile?.is_public || user.status !== 'active') throw missing();
    res.json(publicUser(user));
  });
  router.get('/notifications/stream', notificationStream(db, auth, config));
  router.get('/notifications', (req, res) => resources.list('notification', req, res, { user_id: req.user.id }));
  router.patch('/notifications/:id', async (req, res) => {
    const resource_id = parse(id, req.params.id);
    const row = await resources.one('notification', resource_id);
    if (row.user_id !== req.user.id) throw missing();
    res.json(await db.notification.update({ where: { id: resource_id }, data: parse(schemas.notification, req.body) }));
  });
  router.delete('/notifications/:id', async (req, res) => {
    const resource_id = parse(id, req.params.id);
    const row = await resources.one('notification', resource_id);
    if (row.user_id !== req.user.id) throw missing();
    await db.notification.delete({ where: { id: resource_id } });
    res.status(204).end();
  });
  router.get('/accessibility-settings', async (req, res) => res.json(await db.accessibilitySettings.upsert({
    where: { user_id: req.user.id }, create: { user_id: req.user.id }, update: {}
  })));
  router.patch('/accessibility-settings', async (req, res) => {
    const data = parse(patch(schemas.accessibility), req.body);
    res.json(await db.accessibilitySettings.upsert({ where: { user_id: req.user.id },
      create: { ...data, user_id: req.user.id }, update: data }));
  });
  router.post('/languages', async (req, res) => {
    if (req.user.role !== 'admin') throw forbidden();
    const data = parse(schemas.language, req.body);
    data.code = Intl.getCanonicalLocales(data.code)[0];
    res.status(201).json(await db.language.create({ data }));
  });
}
module.exports = { accountRoutes };
