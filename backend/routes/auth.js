const { schemas } = require('../models/schemas');
const { parse } = require('../middleware/validation');
const { hashPassword, checkPassword, unauthorized } = require('../services/auth');
const { ApiError } = require('../middleware/errors');
function authRoutes(router, db, auth, limiter) {
  router.post('/auth/register', limiter, async (req, res) => {
    const { password, display_name, language_code = 'en', ...data } = parse(schemas.register, req.body);
    const password_hash = await hashPassword(password);
    const result = await db.$transaction(async tx => {
      const language = await tx.language.findUnique({ where: { code: language_code } });
      if (!language?.is_active) throw new ApiError(400, 'INVALID_LANGUAGE', 'Language is not available');
      const user = await tx.user.create({ data: {
        ...data, password_hash, profile: { create: { display_name, language_code } },
        accessibility_settings: { create: {} }
      }, include: { profile: true } });
      return auth.issue(tx, user);
    });
    res.status(201).json(result);
  });
  router.post('/auth/login', limiter, async (req, res) => {
    const data = parse(schemas.login, req.body);
    const user = await db.user.findUnique({ where: { email: data.email }, include: { profile: true } });
    // Perform the expensive work for unknown accounts too.
    const dummy = 'scrypt:00000000000000000000000000000000:' + '0'.repeat(128);
    const matches = await checkPassword(data.password, user?.password_hash || dummy);
    if (!matches || !user || user.status !== 'active') throw unauthorized();
    res.json(await db.$transaction(tx => auth.issue(tx, user)));
  });
  router.post('/auth/refresh', limiter, async (req, res) => {
    const data = parse(schemas.refresh, req.body);
    res.json(await auth.refresh(data.refresh_token));
  });
}
module.exports = { authRoutes };
