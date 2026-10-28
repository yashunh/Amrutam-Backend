import type { PoolClient } from "pg";
import { sha256 } from "../utils/crypto";
import { AppError } from "../utils/errors";

export type IdempotentRecord = {
  requestHash: string;
  responseStatus: number;
  responseBody: unknown;
};

export function payloadHash(payload: unknown): string {
  return sha256(JSON.stringify(payload));
}

export async function findIdempotency(
  client: PoolClient,
  userId: string,
  operation: string,
  key: string,
): Promise<IdempotentRecord | null> {
  const result = await client.query<{
    request_hash: string;
    response_status: number;
    response_body: unknown;
  }>(
    `SELECT request_hash, response_status, response_body
     FROM idempotency_keys
     WHERE user_id = $1 AND operation = $2 AND key = $3`,
    [userId, operation, key],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    requestHash: row.request_hash,
    responseStatus: row.response_status,
    responseBody: row.response_body,
  };
}

export function assertSamePayload(
  existing: IdempotentRecord,
  hash: string,
): void {
  if (existing.requestHash !== hash) {
    throw new AppError(
      409,
      "IDEMPOTENCY_KEY_REUSED",
      "Idempotency key was already used with a different payload",
    );
  }
}

export async function saveIdempotency(
  client: PoolClient,
  input: {
    userId: string;
    operation: string;
    key: string;
    requestHash: string;
    responseStatus: number;
    responseBody: unknown;
  },
): Promise<void> {
  await client.query(
    `INSERT INTO idempotency_keys (
       user_id, operation, key, request_hash, response_status, response_body
     ) VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [
      input.userId,
      input.operation,
      input.key,
      input.requestHash,
      input.responseStatus,
      JSON.stringify(input.responseBody),
    ],
  );
}
