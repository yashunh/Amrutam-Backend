import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env";
import { logger } from "../observability/logger";
import { isAppError } from "../utils/errors";

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const requestId = req.requestId ?? res.getHeader("x-request-id");

  if (isAppError(err)) {
    if (err.statusCode >= 500) {
      logger.error({ err, requestId }, err.message);
    }
    res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        details: err.expose ? err.details : undefined,
      },
      requestId,
    });
    return;
  }

  logger.error({ err, requestId }, "Unhandled error");
  res.status(500).json({
    error: {
      code: "INTERNAL_ERROR",
      message:
        env.NODE_ENV === "production"
          ? "An unexpected error occurred"
          : err instanceof Error
            ? err.message
            : "An unexpected error occurred",
    },
    requestId,
  });
}
