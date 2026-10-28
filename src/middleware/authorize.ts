import type { NextFunction, Request, Response } from "express";
import type { Role } from "../types";
import { AppError } from "../utils/errors";

export function authorize(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new AppError(401, "UNAUTHENTICATED", "Authentication required"));
      return;
    }
    if (!roles.includes(req.user.role)) {
      next(new AppError(403, "FORBIDDEN", "You are not allowed to perform this action"));
      return;
    }
    next();
  };
}
