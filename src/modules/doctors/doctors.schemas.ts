import { z } from "zod";

const uuid = z.string().uuid();

export const createDoctorSchema = z.object({
  body: z.object({
    email: z.string().trim().email().max(255),
    password: z.string().min(12).max(128),
    fullName: z.string().trim().min(2).max(150),
    specialization: z.string().trim().min(2).max(120),
    licenseNumber: z.string().trim().min(3).max(100),
    consultationFee: z.coerce.number().nonnegative(),
    bio: z.string().max(5000).optional(),
    phone: z.string().trim().min(8).max(20).optional(),
  }),
});

export const updateDoctorSchema = z.object({
  body: z.object({
    specialization: z.string().trim().min(2).max(120).optional(),
    bio: z.string().max(5000).nullable().optional(),
    consultationFee: z.coerce.number().nonnegative().optional(),
    fullName: z.string().trim().min(2).max(150).optional(),
    phone: z.string().trim().min(8).max(20).nullable().optional(),
  }),
});

export const searchDoctorsSchema = z.object({
  query: z.object({
    specialization: z.string().trim().max(120).optional(),
    availableFrom: z.string().min(1).optional(),
    availableTo: z.string().min(1).optional(),
    page: z.string().optional(),
    pageSize: z.string().optional(),
  }),
});

export const doctorIdParam = z.object({
  params: z.object({ id: uuid }),
});

export const createSlotSchema = z.object({
  body: z.object({
    startsAt: z.string().min(1),
    endsAt: z.string().min(1),
  }),
});

export const updateSlotSchema = z.object({
  params: z.object({ slotId: uuid }),
  body: z.object({
    startsAt: z.string().min(1).optional(),
    endsAt: z.string().min(1).optional(),
    status: z.enum(["AVAILABLE", "BLOCKED"]).optional(),
  }),
});
