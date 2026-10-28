import { config } from "dotenv";
import { readFileSync } from "node:fs";
import path from "node:path";
import argon2 from "argon2";
import { Client } from "pg";
import { beforeAll, beforeEach } from "vitest";

config();
process.env.NODE_ENV = "test";

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  process.env.JWT_SECRET = "test_jwt_secret_must_be_at_least_32_chars";
}

const adminUrl = process.env.DATABASE_URL;
if (!adminUrl) {
  throw new Error("DATABASE_URL is required");
}

const testUrl =
  process.env.TEST_DATABASE_URL ??
  adminUrl.replace(/\/amrutam(\?|$)/, "/amrutam_test$1");

if (testUrl.includes("/amrutam?") || testUrl.endsWith("/amrutam")) {
  // keep replacement result
}

if (testUrl === adminUrl && !adminUrl.includes("amrutam_test")) {
  throw new Error(
    "Refusing to run tests against the development database. Set TEST_DATABASE_URL.",
  );
}

process.env.DATABASE_URL = testUrl;
process.env.TEST_DATABASE_URL = testUrl;

function toPostgresUrl(url: string): string {
  const parsed = new URL(url);
  parsed.pathname = "/postgres";
  return parsed.toString();
}

function databaseName(url: string): string {
  return new URL(url).pathname.replace(/^\//, "").split("?")[0] ?? "amrutam_test";
}

async function ensureTestDatabase(): Promise<void> {
  const name = databaseName(testUrl);
  const client = new Client({ connectionString: toPostgresUrl(adminUrl) });
  await client.connect();
  try {
    const existing = await client.query(
      `SELECT 1 FROM pg_database WHERE datname = $1`,
      [name],
    );
    if (existing.rowCount === 0) {
      await client.query(`CREATE DATABASE ${name}`);
    }
  } finally {
    await client.end();
  }
}

async function applySchema(): Promise<void> {
  const sql = readFileSync(
    path.join(process.cwd(), "src/db/schema.sql"),
    "utf8",
  );
  const client = new Client({ connectionString: testUrl });
  await client.connect();
  try {
    await client.query(sql);
  } finally {
    await client.end();
  }
}

export const testAdmin = {
  email: "admin@example.com",
  password: "AdminPassword123",
};

beforeAll(async () => {
  await ensureTestDatabase();
  await applySchema();
});

beforeEach(async () => {
  const client = new Client({ connectionString: testUrl });
  await client.connect();
  try {
    await client.query(`
      TRUNCATE TABLE
        audit_logs,
        idempotency_keys,
        refresh_tokens,
        payments,
        prescriptions,
        consultations,
        availability_slots,
        doctors,
        profiles,
        users
      RESTART IDENTITY CASCADE
    `);
    const passwordHash = await argon2.hash(testAdmin.password);
    const user = await client.query<{ id: string }>(
      `INSERT INTO users (email, password_hash, role)
       VALUES ($1, $2, 'ADMIN')
       RETURNING id`,
      [testAdmin.email, passwordHash],
    );
    await client.query(
      `INSERT INTO profiles (user_id, full_name) VALUES ($1, $2)`,
      [user.rows[0]!.id, "System Admin"],
    );
  } finally {
    await client.end();
  }
});
