import { createApp } from './app.js';
import { config } from './config/env.js';
import { pingDatabase } from './config/database.js';

const app = createApp();

async function start() {
  try {
    const ok = await pingDatabase();
    console.log(ok ? '[db] connected to Turso' : '[db] ping returned an unexpected result');
  } catch (error) {
    console.error('[db] could not reach Turso:', error.message);
    console.error('     Check TURSO_DATABASE_URL and TURSO_AUTH_TOKEN in backend/.env');
    process.exit(1);
  }

  app.listen(config.port, () => {
    console.log(`\nRecipeBox API listening on http://localhost:${config.port}`);
    console.log(`Environment : ${config.env}`);
    console.log(`CORS origins: ${config.corsOrigins.join(', ')}`);
    console.log(`Health check: http://localhost:${config.port}/api/health\n`);
  });
}

process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
});

start();
