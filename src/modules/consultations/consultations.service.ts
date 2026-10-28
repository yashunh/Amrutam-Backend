import { writeAudit } from "../../db/audit";
import { pool } from "../../db/pool";
import type { AuthUser } from "../../types";
import { AppError } from "../../utils/errors";
import {
  mapConsultation,
} from "../bookings/bookings.service";

type Loaded = {
  id: string;
  patient_id: string;
  doctor_id: string;
  slot_id: string;
  status: string;
  reason: string | null;
  scheduled_at: Date;
  started_at: Date | null;
  completed_at: Date | null;
  cancelled_at: Date | null;
  created_at: Date;
  doctor_user_id: string;
};

const TRANSITIONS: Record<string, string[]> = {
  BOOKED: ["CONFIRMED", "NO_SHOW"],
  CONFIRMED: ["IN_PROGRESS", "NO_SHOW"],
  IN_PROGRESS: ["COMPLETED"],
};

export async function getConsultation(user: AuthUser, id: string) {
  const row = await loadConsultation(id);
  assertCanView(user, row);
  return mapConsultation(row);
}

export async function transitionStatus(
  user: AuthUser,
  id: string,
  nextStatus: "CONFIRMED" | "IN_PROGRESS" | "COMPLETED" | "NO_SHOW",
  requestId?: string,
) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const found = await client.query<Loaded>(
      `SELECT c.id, c.patient_id, c.doctor_id, c.slot_id, c.status, c.reason,
              c.scheduled_at, c.started_at, c.completed_at, c.cancelled_at, c.created_at,
              d.user_id AS doctor_user_id
       FROM consultations c
       JOIN doctors d ON d.id = c.doctor_id
       WHERE c.id = $1
       FOR UPDATE`,
      [id],
    );
    const row = found.rows[0];
    if (!row) throw new AppError(404, "NOT_FOUND", "Consultation not found");

    if (user.role === "PATIENT") {
      throw new AppError(
        403,
        "FORBIDDEN",
        "Patients cannot change consultation status",
      );
    }
    if (user.role === "DOCTOR" && row.doctor_user_id !== user.id) {
      throw new AppError(403, "FORBIDDEN", "You are not assigned to this consultation");
    }

    const allowed = TRANSITIONS[row.status] ?? [];
    if (!allowed.includes(nextStatus)) {
      throw new AppError(
        409,
        "INVALID_STATUS",
        `Cannot transition from ${row.status} to ${nextStatus}`,
      );
    }

    const startedAt = nextStatus === "IN_PROGRESS" ? new Date() : row.started_at;
    const completedAt = nextStatus === "COMPLETED" ? new Date() : row.completed_at;
    const updated = await client.query(
      `UPDATE consultations
       SET status = $2,
           started_at = $3,
           completed_at = $4,
           updated_at = NOW()
       WHERE id = $1
       RETURNING id, patient_id, doctor_id, slot_id, status, reason,
                 scheduled_at, started_at, completed_at, cancelled_at, created_at`,
      [id, nextStatus, startedAt, completedAt],
    );
    await client.query("COMMIT");
    await writeAudit({
      actorUserId: user.id,
      action: "consultation.status",
      resourceType: "consultation",
      resourceId: id,
      requestId,
      metadata: { from: row.status, to: nextStatus },
    });
    return mapConsultation(updated.rows[0]!);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function loadConsultation(id: string): Promise<Loaded> {
  const result = await pool.query<Loaded>(
    `SELECT c.id, c.patient_id, c.doctor_id, c.slot_id, c.status, c.reason,
            c.scheduled_at, c.started_at, c.completed_at, c.cancelled_at, c.created_at,
            d.user_id AS doctor_user_id
     FROM consultations c
     JOIN doctors d ON d.id = c.doctor_id
     WHERE c.id = $1`,
    [id],
  );
  const row = result.rows[0];
  if (!row) throw new AppError(404, "NOT_FOUND", "Consultation not found");
  return row;
}

export function assertCanView(user: AuthUser, row: Loaded): void {
  if (user.role === "ADMIN") return;
  if (user.role === "PATIENT" && row.patient_id === user.id) return;
  if (user.role === "DOCTOR" && row.doctor_user_id === user.id) return;
  throw new AppError(403, "FORBIDDEN", "You cannot access this consultation");
}

export function assertAssignedDoctor(user: AuthUser, row: Loaded): void {
  if (user.role === "ADMIN") return;
  if (user.role === "DOCTOR" && row.doctor_user_id === user.id) return;
  throw new AppError(403, "FORBIDDEN", "Only the assigned doctor can perform this action");
}
