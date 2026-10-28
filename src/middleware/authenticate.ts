import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { pool } from "../db/pool";
import type { Role } from "../types";
import { AppError } from "../utils/errors";

type AccessClaims = {
  sub: string;
  typ: "access";
};

export async function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const header = req.header("authorization");
    if (!header || !header.startsWith("Bearer ")) {
      throw new AppError(401, "UNAUTHENTICATED", "Authentication required");
    }
    const token = header.slice("Bearer ".length).trim();
    if (!token) {
      throw new AppError(401, "UNAUTHENTICATED", "Authentication required");
    }

    let payload: AccessClaims;
    try {
      payload = jwt.verify(token, env.JWT_SECRET) as AccessClaims;
    } catch {
      throw new AppError(401, "INVALID_TOKEN", "Access token is invalid or expired");
    }

    if (payload.typ !== "access" || !payload.sub) {
      throw new AppError(401, "INVALID_TOKEN", "Access token is invalid or expired");
    }

    const result = await pool.query<{
      id: string;
      email: string;
      role: Role;
      is_active: boolean;
    }>(
      `SELECT id, email, role, is_active FROM users WHERE id = $1`,
      [payload.sub],
    );
    const user = result.rows[0];
    if (!user || !user.is_active) {
      throw new AppError(401, "UNAUTHENTICATED", "Account is not active");
    }

    req.user = {
      id: user.id,
      email: user.email,
      role: user.role,
      isActive: user.is_active,
    };
    next();
  } catch (error) {
    next(error);
  }
}
