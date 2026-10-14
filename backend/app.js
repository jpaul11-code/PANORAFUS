const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const { loadConfig } = require('./config');
const { database } = require('./models');
const { ApiError, requestId, errors, missing } = require('./middleware/errors');
const { apiRoutes } = require('./routes/api');
const { parse, body } = require('./middleware/validation');
function createApp(options = {}) {
  const config = options.config || loadConfig();
  const db = options.db || database();
  const app = express();
  app.disable('x-powered-by');
  app.set('query parser', 'simple');
  app.use(requestId, helmet());
  app.use(cors({
    origin(origin, callback) {
      if (!origin || config.origins.includes(origin)) callback(null, true);
      else callback(new ApiError(403, 'CORS_FORBIDDEN', 'Origin is not allowed'));
    },
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Last-Event-ID'],
    exposedHeaders: ['X-Request-Id'], credentials: false
  }));
  app.use(express.json({ limit: '64kb', strict: true }));
  app.use((req, res, next) => {
    if (['POST', 'PATCH'].includes(req.method) && !req.is('application/json')) {
      throw new ApiError(400, 'INVALID_CONTENT_TYPE', 'Content-Type must be application/json');
    }
    next();
  });
  app.get('/health', (req, res) => { parse(body({}), req.query); res.json({ status: 'ok' }); });
  app.get('/ready', async (req, res) => {
    parse(body({}), req.query);
    try { await db.$queryRaw`SELECT 1`; res.json({ status: 'ready' }); }
    catch { throw new ApiError(503, 'NOT_READY', 'Database is unavailable'); }
  });
  app.use('/api/v1', apiRoutes(db, config, options));
  app.use((req, res, next) => next(missing()));
  app.use(errors);
  return app;
}
module.exports = { createApp };
