import { Router } from "express";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { pool } from "../../db/pool";
import { asyncHandler } from "../../utils/async-handler";

export const adminRouter = Router();

adminRouter.get(
  "/analytics",
  authenticate,
  authorize("ADMIN"),
  asyncHandler(async (_req, res) => {
    const [consultations, payments] = await Promise.all([
      pool.query<{ status: string; count: string }>(
        `SELECT status, COUNT(*)::text AS count
         FROM consultations
         GROUP BY status`,
      ),
      pool.query<{
        status: string;
        count: string;
        total: string | null;
      }>(
        `SELECT status, COUNT(*)::text AS count, COALESCE(SUM(amount), 0)::text AS total
         FROM payments
         GROUP BY status`,
      ),
    ]);

    const consultationCounts = Object.fromEntries(
      consultations.rows.map((row) => [row.status, Number(row.count)]),
    );
    const paymentTotals = Object.fromEntries(
      payments.rows.map((row) => [
        row.status,
        { count: Number(row.count), total: Number(row.total ?? 0) },
      ]),
    );

    res.json({
      consultations: consultationCounts,
      payments: paymentTotals,
    });
  }),
);
