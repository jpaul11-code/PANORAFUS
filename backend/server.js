const { loadConfig } = require('./config');
const { database } = require('./models');
const { createApp } = require('./app');
const config = loadConfig();
const db = database();
const server = createApp({ config, db }).listen(config.port, () => {
  console.log(`Learning API listening on port ${config.port}`);
});
for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => {
  server.close(async () => { await db.$disconnect(); process.exit(0); });
  setTimeout(() => process.exit(1), 10000).unref();
});
