import { z } from "zod";

const medication = z.object({
  name: z.string().trim().min(1).max(200),
  dosage: z.string().trim().min(1).max(200),
  frequency: z.string().trim().min(1).max(200),
  duration: z.string().trim().max(200).optional(),
});

export const createPrescriptionSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z.object({
    diagnosis: z.string().trim().min(3).max(5000),
    medications: z.array(medication).max(50).default([]),
    instructions: z.string().trim().max(5000).optional(),
  }),
});

export const prescriptionIdParam = z.object({
  params: z.object({ id: z.string().uuid() }),
});
