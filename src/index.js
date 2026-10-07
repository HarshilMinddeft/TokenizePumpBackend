const app = require('./app');
const { disconnectDB } = require('./config/database');

let isShuttingDown = false;

async function gracefulShutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.info(`\n[${signal}] Initiating graceful shutdown...`);

  // Safety net: force exit if teardown hangs
  setTimeout(() => {
    console.warn('Graceful shutdown timed out — forcing exit.');
    process.exit(1);
  }, 8000);

  try {
    await disconnectDB();
  } catch (err) {
    console.error('Error closing database connection:', err.message);
  }

  process.exit(0);
}

async function main() {
  try {
    await app.initialize();

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    process.on('uncaughtException', (err) => {
      console.error('Uncaught Exception:', err);
      gracefulShutdown('uncaughtException');
    });

    process.on('unhandledRejection', (reason) => {
      console.error('Unhandled Rejection:', reason);
      gracefulShutdown('unhandledRejection');
    });
  } catch (err) {
    console.error('❌ Failed to initialize application:', err.message);
    process.exit(1);
  }
}

main();
