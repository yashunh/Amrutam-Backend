import { z } from "zod";

export const consultationIdParam = z.object({
  params: z.object({ id: z.string().uuid() }),
});

export const statusSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z.object({
    status: z.enum(["CONFIRMED", "IN_PROGRESS", "COMPLETED", "NO_SHOW"]),
  }),
});
