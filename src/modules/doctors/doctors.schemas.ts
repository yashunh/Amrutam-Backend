import { z } from "zod";

const uuid = z.string().uuid();
const positiveInteger = z.string().regex(/^[1-9]\d*$/);
const dateTime = z.string().datetime({ offset: true });

const doctorSearchQuery = z
  .object({
    specialization: z.string().trim().max(120).optional(),
    availableFrom: dateTime.optional(),
    availableTo: dateTime.optional(),
    page: positiveInteger.optional(),
    pageSize: positiveInteger.optional(),
  })
  .refine(
    ({ availableFrom, availableTo }) =>
      (availableFrom === undefined) === (availableTo === undefined),
    {
      message: "availableFrom and availableTo must be provided together",
      path: ["availableTo"],
    },
  )
  .refine(
    ({ availableFrom, availableTo }) =>
      availableFrom === undefined ||
      availableTo === undefined ||
      Date.parse(availableFrom) < Date.parse(availableTo),
    {
      message: "availableTo must be after availableFrom",
      path: ["availableTo"],
    },
  );

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
  query: doctorSearchQuery,
});

export const doctorIdParam = z.object({
  params: z.object({ id: uuid }),
});

export const createSlotSchema = z.object({
  body: z.object({
    startsAt: dateTime,
    endsAt: dateTime,
  }),
});

export const updateSlotSchema = z.object({
  params: z.object({ slotId: uuid }),
  body: z.object({
    startsAt: dateTime.optional(),
    endsAt: dateTime.optional(),
    status: z.enum(["AVAILABLE", "BLOCKED"]).optional(),
  }),
});
