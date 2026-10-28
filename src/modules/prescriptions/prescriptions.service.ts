import { writeAudit } from "../../db/audit";
import { pool } from "../../db/pool";
import type { AuthUser } from "../../types";
import { AppError } from "../../utils/errors";
import {
  assertAssignedDoctor,
  assertCanView,
  loadConsultation,
} from "../consultations/consultations.service";

type PrescriptionRow = {
  id: string;
  consultation_id: string;
  doctor_id: string;
  patient_id: string;
  diagnosis: string;
  medications: unknown;
  instructions: string | null;
  issued_at: Date;
};

function mapPrescription(row: PrescriptionRow) {
  return {
    id: row.id,
    consultationId: row.consultation_id,
    doctorId: row.doctor_id,
    patientId: row.patient_id,
    diagnosis: row.diagnosis,
    medications: row.medications,
    instructions: row.instructions,
    issuedAt: row.issued_at,
  };
}

export async function createPrescription(
  user: AuthUser,
  consultationId: string,
  input: {
    diagnosis: string;
    medications: unknown[];
    instructions?: string;
  },
  requestId?: string,
) {
  if (user.role === "PATIENT") {
    throw new AppError(403, "FORBIDDEN", "Patients cannot create prescriptions");
  }
  const consultation = await loadConsultation(consultationId);
  assertAssignedDoctor(user, consultation);
  if (!["IN_PROGRESS", "COMPLETED"].includes(consultation.status)) {
    throw new AppError(
      409,
      "INVALID_STATUS",
      "Prescriptions can only be created for in-progress or completed consultations",
    );
  }

  try {
    const result = await pool.query<PrescriptionRow>(
      `INSERT INTO prescriptions (
         consultation_id, doctor_id, patient_id, diagnosis, medications, instructions
       ) VALUES ($1, $2, $3, $4, $5::jsonb, $6)
       RETURNING id, consultation_id, doctor_id, patient_id, diagnosis,
                 medications, instructions, issued_at`,
      [
        consultation.id,
        consultation.doctor_id,
        consultation.patient_id,
        input.diagnosis,
        JSON.stringify(input.medications),
        input.instructions ?? null,
      ],
    );
    const created = mapPrescription(result.rows[0]!);
    await writeAudit({
      actorUserId: user.id,
      action: "prescription.create",
      resourceType: "prescription",
      resourceId: created.id,
      requestId,
      metadata: { consultationId },
    });
    return created;
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "23505"
    ) {
      throw new AppError(
        409,
        "PRESCRIPTION_EXISTS",
        "A prescription already exists for this consultation",
      );
    }
    throw error;
  }
}

export async function getPrescriptionForConsultation(
  user: AuthUser,
  consultationId: string,
) {
  const consultation = await loadConsultation(consultationId);
  assertCanView(user, consultation);
  const result = await pool.query<PrescriptionRow>(
    `SELECT id, consultation_id, doctor_id, patient_id, diagnosis,
            medications, instructions, issued_at
     FROM prescriptions
     WHERE consultation_id = $1`,
    [consultationId],
  );
  const row = result.rows[0];
  if (!row) throw new AppError(404, "NOT_FOUND", "Prescription not found");
  return mapPrescription(row);
}

export async function getPrescriptionById(user: AuthUser, id: string) {
  const result = await pool.query<PrescriptionRow>(
    `SELECT id, consultation_id, doctor_id, patient_id, diagnosis,
            medications, instructions, issued_at
     FROM prescriptions
     WHERE id = $1`,
    [id],
  );
  const row = result.rows[0];
  if (!row) throw new AppError(404, "NOT_FOUND", "Prescription not found");
  const consultation = await loadConsultation(row.consultation_id);
  assertCanView(user, consultation);
  return mapPrescription(row);
}
