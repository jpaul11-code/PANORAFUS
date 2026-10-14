const { missing } = require('../middleware/errors');
const { parse, query, patch, id } = require('../middleware/validation');

function resourceControllers(db) {
  async function one(model, resource_id) {
    const row = await db[model].findUnique({ where: { id: resource_id } });
    if (!row) throw missing();
    return row;
  }
  async function list(model, req, res, where, filters = {}) {
    const values = parse(query(filters), req.query);
    const { limit, offset, ...other } = values;
    const items = await db[model].findMany({
      where: typeof where === 'function' ? await where(other) : where,
      take: limit, skip: offset, orderBy: { id: 'asc' }
    });
    res.json({ items, limit, offset });
  }
  function privateCrud(router, path, model, schema, extraAccess, ownerField = 'user_id') {
    router.get(path, (req, res) => list(model, req, res, { [ownerField]: req.user.id }));
    router.post(path, async (req, res) => {
      const data = parse(schema, req.body);
      if (extraAccess) await extraAccess(data, req);
      res.status(201).json(await db[model].create({ data: { ...data, [ownerField]: req.user.id } }));
    });
    router.get(`${path}/:id`, async (req, res) => {
      const row = await one(model, parse(id, req.params.id));
      if (row[ownerField] !== req.user.id) throw missing();
      res.json(row);
    });
    router.patch(`${path}/:id`, async (req, res) => {
      const resource_id = parse(id, req.params.id);
      const row = await one(model, resource_id);
      if (row[ownerField] !== req.user.id) throw missing();
      const data = parse(patch(schema), req.body);
      if (extraAccess) await extraAccess(data, req, row);
      res.json(await db[model].update({ where: { id: resource_id }, data }));
    });
    router.delete(`${path}/:id`, async (req, res) => {
      const resource_id = parse(id, req.params.id);
      const row = await one(model, resource_id);
      if (row[ownerField] !== req.user.id) throw missing();
      await db[model].delete({ where: { id: resource_id } });
      res.status(204).end();
    });
  }
  return { one, list, privateCrud };
}
module.exports = { resourceControllers };
