import { Router } from "express";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { redisRateLimit } from "../../middleware/rate-limit";
import { validate } from "../../middleware/validate";
import { asyncHandler } from "../../utils/async-handler";
import {
  appointmentIdParam,
  createBookingSchema,
  listAppointmentsSchema,
} from "./bookings.schemas";
import * as bookingsService from "./bookings.service";

export const bookingsRouter = Router();

bookingsRouter.post(
  "/",
  authenticate,
  authorize("PATIENT", "ADMIN"),
  redisRateLimit({ prefix: "rl:book", windowSeconds: 60, max: 20 }),
  validate(createBookingSchema),
  asyncHandler(async (req, res) => {
    const result = await bookingsService.bookSlot(
      req.user!,
      req.body as { slotId: string; reason?: string },
      req.header("idempotency-key") ?? undefined,
      req.requestId,
    );
    res.status(result.status).json(result.body);
  }),
);

bookingsRouter.get(
  "/",
  authenticate,
  validate(listAppointmentsSchema),
  asyncHandler(async (req, res) => {
    const result = await bookingsService.listAppointments(
      req.user!,
      req.query as { status?: string; page?: string; pageSize?: string },
    );
    res.json(result);
  }),
);

bookingsRouter.post(
  "/:id/cancel",
  authenticate,
  validate(appointmentIdParam),
  asyncHandler(async (req, res) => {
    const result = await bookingsService.cancelAppointment(
      req.user!,
      req.params.id as string,
      req.requestId,
    );
    res.json(result);
  }),
);
