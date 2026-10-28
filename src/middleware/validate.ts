import type { NextFunction, Request, Response } from "express";
import type { ZodType } from "zod";
import { AppError } from "../utils/errors";

type RequestSchema = ZodType<{
  body?: unknown;
  query?: unknown;
  params?: unknown;
}>;

export function validate(schema: RequestSchema) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const parsed = schema.safeParse({
      body: req.body,
      query: req.query,
      params: req.params,
    });
    if (!parsed.success) {
      next(
        new AppError(
          400,
          "VALIDATION_ERROR",
          "Request validation failed",
          parsed.error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        ),
      );
      return;
    }
    if (parsed.data.body !== undefined) {
      req.body = parsed.data.body;
    }
    if (parsed.data.query !== undefined) {
      req.validatedQuery = parsed.data.query;
    }
    if (parsed.data.params !== undefined) {
      req.params = parsed.data.params as Request["params"];
    }
    next();
  };
}
