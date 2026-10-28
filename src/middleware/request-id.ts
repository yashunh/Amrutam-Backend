import type { NextFunction, Request, Response } from "express";
import { randomUUID } from "node:crypto";

export function requestId(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const incoming = req.header("x-request-id");
  const id =
    incoming && /^[A-Za-z0-9._-]{8,128}$/.test(incoming)
      ? incoming
      : randomUUID();
  req.requestId = id;
  res.setHeader("x-request-id", id);
  next();
}
