import { z } from "zod";

export const paymentIdParam = z.object({
  params: z.object({ id: z.string().uuid() }),
});

export const simulatePaymentSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z.object({
    outcome: z.enum(["SUCCEEDED", "FAILED"]).default("SUCCEEDED"),
    providerReference: z.string().trim().min(4).max(255).optional(),
  }),
});
