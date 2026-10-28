import argon2 from "argon2";
import jwt from "jsonwebtoken";
import type { Response } from "express";
import { env } from "../../config/env";
import { writeAudit } from "../../db/audit";
import { pool } from "../../db/pool";
import type { Role } from "../../types";
import { randomToken, sha256 } from "../../utils/crypto";
import { AppError } from "../../utils/errors";

const ACCESS_EXPIRES = env.JWT_ACCESS_EXPIRES;

type UserRow = {
  id: string;
  email: string;
  role: Role;
  is_active: boolean;
  password_hash: string;
  full_name: string | null;
};

function publicUser(row: UserRow) {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    fullName: row.full_name,
  };
}

function signAccessToken(userId: string): string {
  return jwt.sign({ sub: userId, typ: "access" }, env.JWT_SECRET, {
    expiresIn: ACCESS_EXPIRES as jwt.SignOptions["expiresIn"],
  });
}

function setRefreshCookie(res: Response, token: string): void {
  res.cookie("refresh_token", token, {
    httpOnly: true,
    sameSite: "strict",
    secure: env.NODE_ENV === "production",
    path: "/v1/auth",
    maxAge: env.JWT_REFRESH_DAYS * 24 * 60 * 60 * 1000,
  });
}

function clearRefreshCookie(res: Response): void {
  res.clearCookie("refresh_token", { path: "/v1/auth" });
}

async function issueRefreshToken(userId: string): Promise<string> {
  const token = randomToken(32);
  const tokenHash = sha256(token);
  const expiresAt = new Date(
    Date.now() + env.JWT_REFRESH_DAYS * 24 * 60 * 60 * 1000,
  );
  await pool.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3)`,
    [userId, tokenHash, expiresAt.toISOString()],
  );
  return token;
}

async function persistSession(res: Response, row: UserRow) {
  const accessToken = signAccessToken(row.id);
  const refreshToken = await issueRefreshToken(row.id);
  setRefreshCookie(res, refreshToken);
  return {
    accessToken,
    refreshToken,
    tokenType: "Bearer",
    expiresIn: ACCESS_EXPIRES,
    user: publicUser(row),
  };
}

export async function registerPatient(
  input: {
    email: string;
    password: string;
    fullName: string;
    phone?: string;
  },
  res: Response,
  requestId?: string,
) {
  const passwordHash = await argon2.hash(input.password);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO users (email, password_hash, role)
       VALUES ($1, $2, 'PATIENT')
       RETURNING id`,
      [input.email.toLowerCase(), passwordHash],
    );
    const userId = inserted.rows[0]?.id;
    if (!userId) {
      throw new AppError(500, "INTERNAL_ERROR", "Failed to create user");
    }
    await client.query(
      `INSERT INTO profiles (user_id, full_name, phone)
       VALUES ($1, $2, $3)`,
      [userId, input.fullName, input.phone ?? null],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "23505"
    ) {
      throw new AppError(409, "EMAIL_TAKEN", "An account with this email already exists");
    }
    throw error;
  } finally {
    client.release();
  }

  const user = await getUserByEmail(input.email);
  if (!user) {
    throw new AppError(500, "INTERNAL_ERROR", "Failed to load created user");
  }
  await writeAudit({
    actorUserId: user.id,
    action: "auth.register",
    resourceType: "user",
    resourceId: user.id,
    requestId,
    metadata: { role: "PATIENT" },
  });
  return persistSession(res, user);
}

export async function login(
  input: { email: string; password: string },
  res: Response,
  requestId?: string,
) {
  const user = await getUserByEmail(input.email);
  if (!user) {
    throw new AppError(401, "INVALID_CREDENTIALS", "Invalid email or password");
  }
  const matches = await argon2.verify(user.password_hash, input.password);
  if (!matches || !user.is_active) {
    throw new AppError(401, "INVALID_CREDENTIALS", "Invalid email or password");
  }
  await writeAudit({
    actorUserId: user.id,
    action: "auth.login",
    resourceType: "user",
    resourceId: user.id,
    requestId,
  });
  return persistSession(res, user);
}

export async function refresh(
  presentedToken: string | undefined,
  res: Response,
) {
  if (!presentedToken) {
    throw new AppError(401, "INVALID_TOKEN", "Refresh token is required");
  }
  const tokenHash = sha256(presentedToken);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const found = await client.query<{
      id: string;
      user_id: string;
      expires_at: Date;
      revoked_at: Date | null;
    }>(
      `SELECT id, user_id, expires_at, revoked_at
       FROM refresh_tokens
       WHERE token_hash = $1
       FOR UPDATE`,
      [tokenHash],
    );
    const current = found.rows[0];
    if (!current) {
      throw new AppError(401, "INVALID_TOKEN", "Refresh token is invalid");
    }
    if (current.revoked_at) {
      await client.query(
        `UPDATE refresh_tokens SET revoked_at = NOW()
         WHERE user_id = $1 AND revoked_at IS NULL`,
        [current.user_id],
      );
      await client.query("COMMIT");
      clearRefreshCookie(res);
      throw new AppError(
        401,
        "REFRESH_REUSE",
        "Refresh token reuse detected; session family revoked",
      );
    }
    if (new Date(current.expires_at).getTime() <= Date.now()) {
      throw new AppError(401, "INVALID_TOKEN", "Refresh token is expired");
    }

    const nextToken = randomToken(32);
    const nextHash = sha256(nextToken);
    const expiresAt = new Date(
      Date.now() + env.JWT_REFRESH_DAYS * 24 * 60 * 60 * 1000,
    );
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [current.user_id, nextHash, expiresAt.toISOString()],
    );
    const nextId = inserted.rows[0]?.id;
    await client.query(
      `UPDATE refresh_tokens
       SET revoked_at = NOW(), replaced_by = $2
       WHERE id = $1`,
      [current.id, nextId],
    );
    await client.query("COMMIT");

    const user = await getUserById(current.user_id);
    if (!user || !user.is_active) {
      throw new AppError(401, "UNAUTHENTICATED", "Account is not active");
    }
    setRefreshCookie(res, nextToken);
    return {
      accessToken: signAccessToken(user.id),
      refreshToken: nextToken,
      tokenType: "Bearer",
      expiresIn: ACCESS_EXPIRES,
      user: publicUser(user),
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function logout(
  presentedToken: string | undefined,
  res: Response,
  userId?: string,
  requestId?: string,
) {
  if (presentedToken) {
    await pool.query(
      `UPDATE refresh_tokens SET revoked_at = NOW()
       WHERE token_hash = $1 AND revoked_at IS NULL`,
      [sha256(presentedToken)],
    );
  } else if (userId) {
    await pool.query(
      `UPDATE refresh_tokens SET revoked_at = NOW()
       WHERE user_id = $1 AND revoked_at IS NULL`,
      [userId],
    );
  }
  clearRefreshCookie(res);
  await writeAudit({
    actorUserId: userId ?? null,
    action: "auth.logout",
    resourceType: "user",
    resourceId: userId ?? null,
    requestId,
  });
}

export async function getMe(userId: string) {
  const user = await getUserById(userId);
  if (!user) {
    throw new AppError(404, "NOT_FOUND", "User not found");
  }
  return publicUser(user);
}

async function getUserByEmail(email: string): Promise<UserRow | undefined> {
  const result = await pool.query<UserRow>(
    `SELECT u.id, u.email, u.role, u.is_active, u.password_hash, p.full_name
     FROM users u
     LEFT JOIN profiles p ON p.user_id = u.id
     WHERE u.email = $1`,
    [email.toLowerCase()],
  );
  return result.rows[0];
}

async function getUserById(id: string): Promise<UserRow | undefined> {
  const result = await pool.query<UserRow>(
    `SELECT u.id, u.email, u.role, u.is_active, u.password_hash, p.full_name
     FROM users u
     LEFT JOIN profiles p ON p.user_id = u.id
     WHERE u.id = $1`,
    [id],
  );
  return result.rows[0];
}
