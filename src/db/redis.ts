import { createClient } from "redis";
import { env } from "../config/env";
import { logger } from "../observability/logger";

export const redis = createClient({
  url: env.REDIS_URL,
  password: env.REDIS_PASSWORD,
  socket: {
    reconnectStrategy: (retries) => Math.min(retries * 100, 2_000),
  },
});

redis.on("error", (error) => {
  logger.error({ err: error }, "Redis client error");
});

export async function connectRedis(): Promise<void> {
  if (!redis.isOpen) {
    await redis.connect();
  }
}

export async function disconnectRedis(): Promise<void> {
  if (redis.isOpen) {
    await redis.quit();
  }
}

export async function redisHealth(): Promise<boolean> {
  try {
    if (!redis.isOpen) return false;
    const pong = await redis.ping();
    return pong === "PONG";
  } catch {
    return false;
  }
}
