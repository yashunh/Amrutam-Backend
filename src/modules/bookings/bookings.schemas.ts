import { z } from "zod";

export const createBookingSchema = z.object({
  body: z.object({
    slotId: z.string().uuid(),
    reason: z.string().trim().max(2000).optional(),
  }),
});

export const listAppointmentsSchema = z.object({
  query: z.object({
    status: z
      .enum([
        "BOOKED",
        "CONFIRMED",
        "IN_PROGRESS",
        "COMPLETED",
        "CANCELLED",
        "NO_SHOW",
      ])
      .optional(),
    page: z.string().optional(),
    pageSize: z.string().optional(),
  }),
});

export const appointmentIdParam = z.object({
  params: z.object({ id: z.string().uuid() }),
});
