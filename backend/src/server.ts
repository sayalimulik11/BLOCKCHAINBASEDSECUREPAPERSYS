import { loadConfig } from "./config.js";
import { createApp } from "./app.js";
import { JsonRpcProvider } from "ethers";
import { prisma } from "./db.js";
import { ExamVaultIndexer } from "./indexer/indexer.js";
import { logger } from "./logger.js";

try {
  const cfg = loadConfig();
  const app = createApp(cfg);
  const provider = new JsonRpcProvider(cfg.RPC_URL);
  const indexer = new ExamVaultIndexer(cfg, provider, prisma);

  void indexer.start().catch((err: unknown) => {
    logger.error({ err }, "Failed to start the event indexer");
  });

  const server = app.listen(cfg.PORT, () => {
    logger.info(`🚀 SIGIL Backend server listening on port ${cfg.PORT}`);
    logger.info(`Chain RPC: ${cfg.RPC_URL} (Chain ID: ${cfg.CHAIN_ID})`);
    logger.info(`Contract Address: ${cfg.CONTRACT_ADDRESS}`);
  });

  let shutdownPromise: Promise<void> | undefined;
  const shutdown = () => {
    if (shutdownPromise) return shutdownPromise;

    indexer.stop();
    shutdownPromise = new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    }).then(async () => {
      provider.destroy();
      await prisma.$disconnect();
    });
    return shutdownPromise;
  };

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => {
      void shutdown().catch((err: unknown) => {
        logger.error({ err, signal }, "Failed to shut down the backend cleanly");
        process.exitCode = 1;
      });
    });
  }
} catch (err: any) {
  logger.error(`Fatal server boot failure: ${err.message}`);
  process.exit(1);
}
