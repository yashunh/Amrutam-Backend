import {
  assertSamePayload,
  findIdempotency,
  payloadHash,
  saveIdempotency,
} from "../../db/idempotency";
import { writeAudit } from "../../db/audit";
import { pool } from "../../db/pool";
import type { AuthUser } from "../../types";
import { AppError } from "../../utils/errors";
import { parsePagination } from "../../utils/pagination";
import { getDoctorByUserId } from "../doctors/doctors.service";

type ConsultationRow = {
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
};

export function mapConsultation(row: ConsultationRow) {
  return {
    id: row.id,
    patientId: row.patient_id,
    doctorId: row.doctor_id,
    slotId: row.slot_id,
    status: row.status,
    reason: row.reason,
    scheduledAt: row.scheduled_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    cancelledAt: row.cancelled_at,
    createdAt: row.created_at,
  };
}

export async function bookSlot(
  user: AuthUser,
  input: { slotId: string; reason?: string },
  idempotencyKey: string | undefined,
  requestId?: string,
) {
  if (user.role !== "PATIENT" && user.role !== "ADMIN") {
    throw new AppError(403, "FORBIDDEN", "Only patients can book appointments");
  }
  if (!idempotencyKey || idempotencyKey.length < 8 || idempotencyKey.length > 128) {
    throw new AppError(
      400,
      "IDEMPOTENCY_KEY_REQUIRED",
      "Provide an Idempotency-Key header (8-128 characters)",
    );
  }

  const hash = payloadHash({
    slotId: input.slotId,
    reason: input.reason ?? null,
  });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const existing = await findIdempotency(
      client,
      user.id,
      "booking.create",
      idempotencyKey,
    );
    if (existing) {
      assertSamePayload(existing, hash);
      await client.query("COMMIT");
      return {
        replayed: true,
        status: existing.responseStatus,
        body: existing.responseBody,
      };
    }

    const slotResult = await client.query<{
      id: string;
      doctor_id: string;
      status: string;
      starts_at: Date;
    }>(
      `SELECT id, doctor_id, status, starts_at
       FROM availability_slots
       WHERE id = $1
       FOR UPDATE`,
      [input.slotId],
    );
    const slot = slotResult.rows[0];
    if (!slot) {
      throw new AppError(404, "NOT_FOUND", "Availability slot not found");
    }
    if (slot.status !== "AVAILABLE") {
      throw new AppError(409, "SLOT_UNAVAILABLE", "This slot is no longer available");
    }

    const doctor = await client.query<{
      id: string;
      is_verified: boolean;
      consultation_fee: string;
    }>(
      `SELECT id, is_verified, consultation_fee FROM doctors WHERE id = $1`,
      [slot.doctor_id],
    );
    const doctorRow = doctor.rows[0];
    if (!doctorRow?.is_verified) {
      throw new AppError(409, "DOCTOR_UNVERIFIED", "Doctor is not available for booking");
    }

    const consultation = await client.query<ConsultationRow>(
      `INSERT INTO consultations (
         patient_id, doctor_id, slot_id, status, reason, scheduled_at
       ) VALUES ($1, $2, $3, 'BOOKED', $4, $5)
       RETURNING id, patient_id, doctor_id, slot_id, status, reason,
                 scheduled_at, started_at, completed_at, cancelled_at, created_at`,
      [user.id, slot.doctor_id, slot.id, input.reason ?? null, slot.starts_at],
    );
    const created = consultation.rows[0];
    if (!created) {
      throw new AppError(500, "INTERNAL_ERROR", "Failed to create consultation");
    }

    await client.query(
      `UPDATE availability_slots SET status = 'BOOKED' WHERE id = $1`,
      [slot.id],
    );

    const payment = await client.query<{
      id: string;
      amount: string;
      currency: string;
      status: string;
    }>(
      `INSERT INTO payments (consultation_id, amount, currency, status, provider)
       VALUES ($1, $2, 'INR', 'PENDING', 'simulated')
       RETURNING id, amount, currency, status`,
      [created.id, doctorRow.consultation_fee],
    );

    const body = {
      consultation: mapConsultation(created),
      payment: {
        id: payment.rows[0]!.id,
        amount: Number(payment.rows[0]!.amount),
        currency: payment.rows[0]!.currency,
        status: payment.rows[0]!.status,
        provider: "simulated",
      },
    };

    await saveIdempotency(client, {
      userId: user.id,
      operation: "booking.create",
      key: idempotencyKey,
      requestHash: hash,
      responseStatus: 201,
      responseBody: body,
    });
    await client.query("COMMIT");

    await writeAudit({
      actorUserId: user.id,
      action: "booking.create",
      resourceType: "consultation",
      resourceId: created.id,
      requestId,
      metadata: { slotId: slot.id },
    });

    return { replayed: false, status: 201, body };
  } catch (error) {
    await client.query("ROLLBACK");
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "23505"
    ) {
      throw new AppError(409, "SLOT_UNAVAILABLE", "This slot is no longer available");
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function listAppointments(
  user: AuthUser,
  query: { status?: string; page?: string; pageSize?: string },
) {
  const { page, pageSize, offset } = parsePagination(query.page, query.pageSize);
  const params: unknown[] = [];
  const filters: string[] = [];

  if (user.role === "PATIENT") {
    params.push(user.id);
    filters.push(`c.patient_id = $${params.length}`);
  } else if (user.role === "DOCTOR") {
    const doctor = await getDoctorByUserId(user.id);
    params.push(doctor.id);
    filters.push(`c.doctor_id = $${params.length}`);
  }

  if (query.status) {
    params.push(query.status);
    filters.push(`c.status = $${params.length}`);
  }

  const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  const count = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM consultations c ${where}`,
    params,
  );
  params.push(pageSize, offset);
  const result = await pool.query<ConsultationRow>(
    `SELECT c.id, c.patient_id, c.doctor_id, c.slot_id, c.status, c.reason,
            c.scheduled_at, c.started_at, c.completed_at, c.cancelled_at, c.created_at
     FROM consultations c
     ${where}
     ORDER BY c.scheduled_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  return {
    items: result.rows.map(mapConsultation),
    page,
    pageSize,
    total: Number(count.rows[0]?.count ?? 0),
  };
}

export async function cancelAppointment(
  user: AuthUser,
  consultationId: string,
  requestId?: string,
) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const found = await client.query<ConsultationRow & { doctor_user_id: string }>(
      `SELECT c.id, c.patient_id, c.doctor_id, c.slot_id, c.status, c.reason,
              c.scheduled_at, c.started_at, c.completed_at, c.cancelled_at, c.created_at,
              d.user_id AS doctor_user_id
       FROM consultations c
       JOIN doctors d ON d.id = c.doctor_id
       WHERE c.id = $1
       FOR UPDATE`,
      [consultationId],
    );
    const row = found.rows[0];
    if (!row) throw new AppError(404, "NOT_FOUND", "Appointment not found");

    const allowed =
      user.role === "ADMIN" ||
      row.patient_id === user.id ||
      row.doctor_user_id === user.id;
    if (!allowed) {
      throw new AppError(403, "FORBIDDEN", "You cannot cancel this appointment");
    }
    if (row.status === "COMPLETED" || row.status === "CANCELLED") {
      throw new AppError(409, "INVALID_STATUS", "Appointment cannot be cancelled");
    }

    const updated = await client.query<ConsultationRow>(
      `UPDATE consultations
       SET status = 'CANCELLED', cancelled_at = NOW(), updated_at = NOW()
       WHERE id = $1
       RETURNING id, patient_id, doctor_id, slot_id, status, reason,
                 scheduled_at, started_at, completed_at, cancelled_at, created_at`,
      [consultationId],
    );
    await client.query(
      `UPDATE availability_slots SET status = 'AVAILABLE' WHERE id = $1`,
      [row.slot_id],
    );
    await client.query("COMMIT");
    await writeAudit({
      actorUserId: user.id,
      action: "booking.cancel",
      resourceType: "consultation",
      resourceId: consultationId,
      requestId,
    });
    return mapConsultation(updated.rows[0]!);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
