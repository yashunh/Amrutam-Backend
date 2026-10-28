import { pool } from "./pool";

export async function writeAudit(input: {
  actorUserId?: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  requestId?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await pool.query(
    `INSERT INTO audit_logs (
       actor_user_id, action, resource_type, resource_id, request_id, metadata
     ) VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [
      input.actorUserId ?? null,
      input.action,
      input.resourceType,
      input.resourceId ?? null,
      input.requestId ?? null,
      JSON.stringify(input.metadata ?? {}),
    ],
  );
}
