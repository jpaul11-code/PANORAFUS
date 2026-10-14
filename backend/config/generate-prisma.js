const path = require('node:path');
const { spawnSync } = require('node:child_process');
const result = spawnSync(process.execPath, [
  require.resolve('prisma/build/index.js'), 'generate',
  '--schema', path.resolve(__dirname, '../../prisma/schema.prisma')
], {
  env: { ...process.env, PRISMA_GENERATE_SKIP_AUTOINSTALL: 'true' },
  stdio: 'inherit'
});
if (result.error) console.error('Unable to start the Prisma generator');
process.exitCode = result.status ?? 1;
