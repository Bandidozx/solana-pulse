#!/usr/bin/env node
// solana-pulse entrypoint: wire config -> monitor -> notifier -> server.

import { config } from './config.js';
import { createLogger } from './logger.js';
import { createNotifier } from './notify.js';
import { createMonitor } from './monitor.js';
import { createServer } from './server.js';

const log = createLogger(config.logLevel);
const history = [];

const notifier = createNotifier(config, log);
const server = createServer(
  config,
  log,
  () => ({ ...monitor.stats, history: history.length }),
  () => history,
);

const monitor = createMonitor(config, log, notifier, (alert) => {
  history.push(alert);
  if (history.length > 500) history.shift();
  server.broadcast(alert);
});

async function main() {
  await server.start();
  await monitor.start();
  log.info(
    `solana-pulse up | watching ${config.watchedPrograms.length} program(s) | ` +
      `SOL whale >= ${config.solWhaleLamports / 1e9} | token whale >= ${config.tokenWhaleUi}`,
  );

  const shutdown = async (sig) => {
    log.info(`received ${sig}, shutting down`);
    await monitor.stop();
    server.stop();
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((e) => {
  log.error('fatal:', e);
  process.exit(1);
});
