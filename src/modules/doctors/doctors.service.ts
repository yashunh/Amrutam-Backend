import argon2 from "argon2";
import { writeAudit } from "../../db/audit";
import { pool } from "../../db/pool";
import type { AuthUser } from "../../types";
import { parsePagination } from "../../utils/pagination";
import { AppError } from "../../utils/errors";

type DoctorRow = {
  id: string;
  user_id: string;
  specialization: string;
  license_number: string;
  bio: string | null;
  consultation_fee: string;
  is_verified: boolean;
  full_name: string;
  email: string;
};

function mapDoctor(row: DoctorRow) {
  return {
    id: row.id,
    userId: row.user_id,
    fullName: row.full_name,
    email: row.email,
    specialization: row.specialization,
    licenseNumber: row.license_number,
    bio: row.bio,
    consultationFee: Number(row.consultation_fee),
    isVerified: row.is_verified,
  };
}

const DOCTOR_SELECT = `
  SELECT d.id, d.user_id, d.specialization, d.license_number, d.bio,
         d.consultation_fee, d.is_verified, p.full_name, u.email
  FROM doctors d
  JOIN users u ON u.id = d.user_id
  JOIN profiles p ON p.user_id = u.id
`;

export async function createDoctor(
  input: {
    email: string;
    password: string;
    fullName: string;
    specialization: string;
    licenseNumber: string;
    consultationFee: number;
    bio?: string;
    phone?: string;
  },
  actor: AuthUser,
  requestId?: string,
) {
  const passwordHash = await argon2.hash(input.password);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const user = await client.query<{ id: string }>(
      `INSERT INTO users (email, password_hash, role)
       VALUES ($1, $2, 'DOCTOR')
       RETURNING id`,
      [input.email.toLowerCase(), passwordHash],
    );
    const userId = user.rows[0]?.id;
    if (!userId) throw new AppError(500, "INTERNAL_ERROR", "Failed to create doctor user");
    await client.query(
      `INSERT INTO profiles (user_id, full_name, phone) VALUES ($1, $2, $3)`,
      [userId, input.fullName, input.phone ?? null],
    );
    const doctor = await client.query<{ id: string }>(
      `INSERT INTO doctors (
         user_id, specialization, license_number, bio, consultation_fee
       ) VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [
        userId,
        input.specialization,
        input.licenseNumber,
        input.bio ?? null,
        input.consultationFee,
      ],
    );
    await client.query("COMMIT");
    const created = await getDoctorById(doctor.rows[0]!.id, true);
    await writeAudit({
      actorUserId: actor.id,
      action: "doctor.create",
      resourceType: "doctor",
      resourceId: created.id,
      requestId,
    });
    return created;
  } catch (error) {
    await client.query("ROLLBACK");
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "23505"
    ) {
      throw new AppError(
        409,
        "DOCTOR_CONFLICT",
        "Email or license number already exists",
      );
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function verifyDoctor(
  doctorId: string,
  actor: AuthUser,
  requestId?: string,
) {
  const result = await pool.query(
    `UPDATE doctors SET is_verified = TRUE, updated_at = NOW()
     WHERE id = $1
     RETURNING id`,
    [doctorId],
  );
  if (!result.rows[0]) {
    throw new AppError(404, "NOT_FOUND", "Doctor not found");
  }
  await writeAudit({
    actorUserId: actor.id,
    action: "doctor.verify",
    resourceType: "doctor",
    resourceId: doctorId,
    requestId,
  });
  return getDoctorById(doctorId, true);
}

export async function getDoctorById(id: string, includeUnverified = false) {
  const result = await pool.query<DoctorRow>(
    `${DOCTOR_SELECT} WHERE d.id = $1 ${includeUnverified ? "" : "AND d.is_verified = TRUE"}`,
    [id],
  );
  const row = result.rows[0];
  if (!row) throw new AppError(404, "NOT_FOUND", "Doctor not found");
  return mapDoctor(row);
}

export async function getDoctorByUserId(userId: string) {
  const result = await pool.query<DoctorRow>(
    `${DOCTOR_SELECT} WHERE d.user_id = $1`,
    [userId],
  );
  const row = result.rows[0];
  if (!row) throw new AppError(404, "NOT_FOUND", "Doctor profile not found");
  return mapDoctor(row);
}

export async function updateOwnDoctor(
  user: AuthUser,
  input: {
    specialization?: string;
    bio?: string | null;
    consultationFee?: number;
    fullName?: string;
    phone?: string | null;
  },
) {
  const doctor = await getDoctorByUserId(user.id);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `UPDATE doctors
       SET specialization = COALESCE($2, specialization),
           bio = COALESCE($3, bio),
           consultation_fee = COALESCE($4, consultation_fee),
           updated_at = NOW()
       WHERE id = $1`,
      [
        doctor.id,
        input.specialization ?? null,
        input.bio === undefined ? null : input.bio,
        input.consultationFee ?? null,
      ],
    );
    if (input.bio === null) {
      await client.query(`UPDATE doctors SET bio = NULL WHERE id = $1`, [doctor.id]);
    }
    await client.query(
      `UPDATE profiles
       SET full_name = COALESCE($2, full_name),
           phone = COALESCE($3, phone),
           updated_at = NOW()
       WHERE user_id = $1`,
      [user.id, input.fullName ?? null, input.phone ?? null],
    );
    if (input.phone === null) {
      await client.query(`UPDATE profiles SET phone = NULL WHERE user_id = $1`, [
        user.id,
      ]);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  return getDoctorByUserId(user.id);
}

export async function searchDoctors(query: {
  specialization?: string;
  availableFrom?: string;
  availableTo?: string;
  page?: string;
  pageSize?: string;
}) {
  const { page, pageSize, offset } = parsePagination(query.page, query.pageSize);
  const params: unknown[] = [];
  const filters = ["d.is_verified = TRUE"];

  if (query.specialization) {
    params.push(`%${query.specialization}%`);
    filters.push(`d.specialization ILIKE $${params.length}`);
  }
  if (query.availableFrom && query.availableTo) {
    params.push(query.availableFrom, query.availableTo);
    filters.push(`EXISTS (
      SELECT 1 FROM availability_slots s
      WHERE s.doctor_id = d.id
        AND s.status = 'AVAILABLE'
        AND s.starts_at >= $${params.length - 1}
        AND s.starts_at < $${params.length}
    )`);
  }

  const where = filters.join(" AND ");
  const count = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM doctors d WHERE ${where}`,
    params,
  );
  params.push(pageSize, offset);
  const result = await pool.query<DoctorRow>(
    `${DOCTOR_SELECT}
     WHERE ${where}
     ORDER BY d.created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  return {
    items: result.rows.map(mapDoctor),
    page,
    pageSize,
    total: Number(count.rows[0]?.count ?? 0),
  };
}

export async function listAvailability(doctorId: string, includeUnverified = false) {
  if (!includeUnverified) {
    await getDoctorById(doctorId, false);
  }
  const result = await pool.query(
    `SELECT id, doctor_id, starts_at, ends_at, status
     FROM availability_slots
     WHERE doctor_id = $1
     ORDER BY starts_at ASC
     LIMIT 200`,
    [doctorId],
  );
  return result.rows.map(mapSlot);
}

function mapSlot(row: {
  id: string;
  doctor_id: string;
  starts_at: Date;
  ends_at: Date;
  status: string;
}) {
  return {
    id: row.id,
    doctorId: row.doctor_id,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    status: row.status,
  };
}

export async function createAvailability(
  user: AuthUser,
  input: { startsAt: string; endsAt: string },
  requestId?: string,
) {
  const doctor =
    user.role === "ADMIN"
      ? null
      : await getDoctorByUserId(user.id);
  const doctorId = doctor?.id;
  if (!doctorId) {
    throw new AppError(400, "VALIDATION_ERROR", "Doctor profile required");
  }
  if (new Date(input.endsAt) <= new Date(input.startsAt)) {
    throw new AppError(400, "VALIDATION_ERROR", "endsAt must be after startsAt");
  }
  try {
    const result = await pool.query(
      `INSERT INTO availability_slots (doctor_id, starts_at, ends_at)
       VALUES ($1, $2, $3)
       RETURNING id, doctor_id, starts_at, ends_at, status`,
      [doctorId, input.startsAt, input.endsAt],
    );
    const slot = mapSlot(result.rows[0]!);
    await writeAudit({
      actorUserId: user.id,
      action: "availability.create",
      resourceType: "availability_slot",
      resourceId: slot.id,
      requestId,
    });
    return slot;
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error.code === "23505" || error.code === "23P01")
    ) {
      throw new AppError(409, "SLOT_OVERLAP", "Slot overlaps an existing slot");
    }
    throw error;
  }
}

export async function updateAvailability(
  user: AuthUser,
  slotId: string,
  input: { startsAt?: string; endsAt?: string; status?: "AVAILABLE" | "BLOCKED" },
  requestId?: string,
) {
  const slotResult = await pool.query(
    `SELECT s.id, s.doctor_id, s.status, d.user_id
     FROM availability_slots s
     JOIN doctors d ON d.id = s.doctor_id
     WHERE s.id = $1`,
    [slotId],
  );
  const slot = slotResult.rows[0];
  if (!slot) throw new AppError(404, "NOT_FOUND", "Slot not found");
  if (user.role !== "ADMIN" && slot.user_id !== user.id) {
    throw new AppError(403, "FORBIDDEN", "You cannot modify this slot");
  }
  if (slot.status === "BOOKED") {
    throw new AppError(409, "SLOT_BOOKED", "Booked slots cannot be edited");
  }
  try {
    const result = await pool.query(
      `UPDATE availability_slots
       SET starts_at = COALESCE($2, starts_at),
           ends_at = COALESCE($3, ends_at),
           status = COALESCE($4, status)
       WHERE id = $1
       RETURNING id, doctor_id, starts_at, ends_at, status`,
      [slotId, input.startsAt ?? null, input.endsAt ?? null, input.status ?? null],
    );
    const updated = mapSlot(result.rows[0]!);
    await writeAudit({
      actorUserId: user.id,
      action: "availability.update",
      resourceType: "availability_slot",
      resourceId: slotId,
      requestId,
    });
    return updated;
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error.code === "23505" || error.code === "23P01")
    ) {
      throw new AppError(409, "SLOT_OVERLAP", "Slot overlaps an existing slot");
    }
    throw error;
  }
}

export async function requireDoctorRecord(user: AuthUser) {
  if (user.role === "DOCTOR") return getDoctorByUserId(user.id);
  throw new AppError(403, "FORBIDDEN", "Doctor role required");
}
