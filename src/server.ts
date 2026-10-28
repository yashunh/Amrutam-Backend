import { env } from "./config/env";
import { pool } from "./db/pool";
import { connectRedis, disconnectRedis } from "./db/redis";
import { app } from "./app";
import { logger } from "./observability/logger";

async function start(): Promise<void> {
  await connectRedis();
  const server = app.listen(env.PORT, "0.0.0.0", () => {
    logger.info({ port: env.PORT }, "Amrutam API listening");
  });

  let shuttingDown = false;
  async function shutdown(signal: string): Promise<void> {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, "Graceful shutdown started");
    server.close((closeError) => {
      if (closeError) {
        logger.error({ err: closeError }, "HTTP server close failed");
      }
    });
    try {
      await Promise.all([pool.end(), disconnectRedis()]);
      process.exit(0);
    } catch (error) {
      logger.error({ err: error }, "Error during shutdown");
      process.exit(1);
    }
  }

  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });

  setTimeout(() => {
    if (shuttingDown) {
      logger.error("Shutdown timed out");
      process.exit(1);
    }
  }, 10_000).unref();
}

start().catch((error: unknown) => {
  logger.error({ err: error }, "Failed to start server");
  process.exit(1);
});
