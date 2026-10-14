const express = require('express');
const { rateLimit } = require('express-rate-limit');
const { resourceControllers } = require('../controllers/resources');
const { accessService } = require('../services/access');
const { authService, unauthorized } = require('../services/auth');
const { aiService, inputs } = require('../services/ai');
const { parse, body, id, z, text, language } = require('../middleware/validation');
const { ApiError } = require('../middleware/errors');
const { authRoutes } = require('./auth');
const { accountRoutes } = require('./account');
const { learningRoutes } = require('./learning');
const { communityRoutes } = require('./community');
const { adminRoutes } = require('./admin');
function limiter(limit) {
  return rateLimit({
    windowMs: 60000, limit, standardHeaders: 'draft-8', legacyHeaders: false,
    handler(req, res, next) { next(new ApiError(429, 'RATE_LIMITED', 'Too many requests')); }
  });
}
function apiRoutes(db, config, options = {}) {
  const router = express.Router();
  const requestLimiter = rateLimit({
    windowMs: 60000, limit: options.requestLimit || 300,
    standardHeaders: 'draft-8', legacyHeaders: false,
    handler(req, res, next) { next(new ApiError(429, 'RATE_LIMITED', 'Too many requests')); }
  });
  router.use(requestLimiter);
  const collections = new Set(['/languages', '/bible/books', '/bible/passages', '/bible/search',
    '/study-plans', '/lessons', '/questions', '/study-sessions', '/journals', '/prayers', '/groups',
    '/comments', '/notifications', '/admin/users', '/admin/audit-logs']);
  router.use((req, res, next) => {
    const nestedCollection = /^\/(study-plans\/[^/]+\/lessons|lessons\/[^/]+\/questions|questions\/[^/]+\/answers|groups\/[^/]+\/(members|sessions))\/?$/.test(req.path);
    if (req.method !== 'GET' || !(collections.has(req.path.replace(/\/$/, '')) || nestedCollection)) parse(body({}), req.query);
    next();
  });
  const resources = resourceControllers(db);
  const auth = authService(db, config);
  const access = accessService(db, resources.one);
  authRoutes(router, db, auth, limiter(options.authLimit || 20));
  router.get('/languages', (req, res) => resources.list('language', req, res, { is_active: true }));
  router.get('/bible/books', (req, res) => resources.list('bibleBook', req, res, {}));
  router.get('/bible/books/:id', async (req, res) => res.json(await resources.one('bibleBook', parse(id, req.params.id))));
  router.get('/bible/passages', (req, res) => resources.list('biblePassage', req, res, filters => filters, {
    book_id: id.optional(), chapter: z.coerce.number().int().min(1).max(150).optional(),
    language_code: language.optional(), translation: text(100).optional()
  }));
  router.get('/bible/passages/:id', async (req, res) => res.json(await resources.one('biblePassage', parse(id, req.params.id))));
  router.get('/bible/search', (req, res) => resources.list('biblePassage', req, res, filters => ({
    text: { contains: filters.q, mode: 'insensitive' }, ...(filters.language_code ? { language_code: filters.language_code } : {})
  }), { q: text(200), language_code: language.optional() }));
  router.use(async (req, res, next) => {
    const header = req.headers.authorization;
    const parts = typeof header === 'string' ? header.split(' ') : [];
    if (parts.length !== 2 || parts[0] !== 'Bearer' || !/^[A-Za-z0-9_.-]+$/.test(parts[1])) throw unauthorized();
    const token = parts[1];
    const result = await auth.authenticate(token);
    req.user = result.user; req.token_exp = result.exp; req.access_token = token;
    next();
  });
  accountRoutes(router, db, resources, auth, config);
  learningRoutes(router, db, resources, access);
  communityRoutes(router, db, resources, access);
  adminRoutes(router, db, resources);
  const generate = aiService(config, options.fetch);
  const aiLimit = limiter(options.aiLimit || 10);
  for (const operation of Object.keys(inputs)) router.post(`/ai/${operation}`, aiLimit, async (req, res) => {
    res.json(await generate(operation, parse(inputs[operation], req.body)));
  });
  return router;
}
module.exports = { apiRoutes };
