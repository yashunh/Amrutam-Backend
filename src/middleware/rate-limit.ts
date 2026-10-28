import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env";
import { redis } from "../db/redis";
import { logger } from "../observability/logger";
import { AppError } from "../utils/errors";

export function redisRateLimit(options: {
  prefix: string;
  windowSeconds: number;
  max: number;
}) {
  return async (
    req: Request,
    _res: Response,
    next: NextFunction,
  ): Promise<void> => {
    if (env.NODE_ENV === "test") {
      next();
      return;
    }
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    const key = `${options.prefix}:${ip}`;
    try {
      const count = await redis.incr(key);
      if (count === 1) {
        await redis.expire(key, options.windowSeconds);
      }
      if (count > options.max) {
        next(
          new AppError(
            429,
            "RATE_LIMITED",
            "Too many requests. Please try again later.",
          ),
        );
        return;
      }
      next();
    } catch (error) {
      logger.warn({ err: error }, "Rate limiter skipped because Redis is unavailable");
      next();
    }
  };
}
