import { env } from "../../config/env";
import { writeAudit } from "../../db/audit";
import { pool } from "../../db/pool";
import type { AuthUser } from "../../types";
import { AppError } from "../../utils/errors";
import { newId } from "../../utils/crypto";
import {
  assertCanView,
  loadConsultation,
} from "../consultations/consultations.service";

type PaymentRow = {
  id: string;
  consultation_id: string;
  amount: string;
  currency: string;
  status: string;
  provider: string | null;
  provider_reference: string | null;
};

function mapPayment(row: PaymentRow) {
  return {
    id: row.id,
    consultationId: row.consultation_id,
    amount: Number(row.amount),
    currency: row.currency,
    status: row.status,
    provider: row.provider,
    providerReference: row.provider_reference,
    collected: row.status === "SUCCEEDED",
    simulated: row.provider === "simulated",
  };
}

export async function getPayment(user: AuthUser, id: string) {
  const result = await pool.query<PaymentRow>(
    `SELECT id, consultation_id, amount, currency, status, provider, provider_reference
     FROM payments WHERE id = $1`,
    [id],
  );
  const row = result.rows[0];
  if (!row) throw new AppError(404, "NOT_FOUND", "Payment not found");
  const consultation = await loadConsultation(row.consultation_id);
  assertCanView(user, consultation);
  return mapPayment(row);
}

export async function simulatePayment(
  user: AuthUser,
  id: string,
  input: { outcome: "SUCCEEDED" | "FAILED"; providerReference?: string },
  requestId?: string,
) {
  if (env.NODE_ENV === "production") {
    throw new AppError(
      403,
      "SIMULATION_DISABLED",
      "Simulated payment capture is disabled in production",
    );
  }
  if (user.role !== "ADMIN" && user.role !== "PATIENT") {
    throw new AppError(403, "FORBIDDEN", "Not allowed to update this payment");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const found = await client.query<PaymentRow>(
      `SELECT id, consultation_id, amount, currency, status, provider, provider_reference
       FROM payments WHERE id = $1 FOR UPDATE`,
      [id],
    );
    const row = found.rows[0];
    if (!row) throw new AppError(404, "NOT_FOUND", "Payment not found");

    const consultation = await loadConsultation(row.consultation_id);
    assertCanView(user, consultation);

    if (row.status === input.outcome) {
      await client.query("COMMIT");
      return mapPayment(row);
    }
    if (row.status === "SUCCEEDED" || row.status === "REFUNDED") {
      throw new AppError(409, "PAYMENT_FINAL", "Payment is already in a final state");
    }

    const reference = input.providerReference ?? `sim_${newId()}`;
    const updated = await client.query<PaymentRow>(
      `UPDATE payments
       SET status = $2,
           provider = 'simulated',
           provider_reference = $3,
           updated_at = NOW()
       WHERE id = $1
       RETURNING id, consultation_id, amount, currency, status, provider, provider_reference`,
      [id, input.outcome, reference],
    );
    await client.query("COMMIT");
    await writeAudit({
      actorUserId: user.id,
      action: "payment.simulate",
      resourceType: "payment",
      resourceId: id,
      requestId,
      metadata: { outcome: input.outcome },
    });
    return mapPayment(updated.rows[0]!);
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
        "DUPLICATE_PAYMENT",
        "This provider reference was already processed",
      );
    }
    throw error;
  } finally {
    client.release();
  }
}
