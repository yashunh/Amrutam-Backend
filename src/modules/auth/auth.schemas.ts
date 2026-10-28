import { z } from "zod";

export const registerSchema = z.object({
  body: z.object({
    email: z.string().trim().email().max(255),
    password: z.string().min(12).max(128),
    fullName: z.string().trim().min(2).max(150),
    phone: z.string().trim().min(8).max(20).optional(),
  }),
});

export const loginSchema = z.object({
  body: z.object({
    email: z.string().trim().email().max(255),
    password: z.string().min(1).max(128),
  }),
});

export const refreshSchema = z.object({
  body: z.object({
    refreshToken: z.string().min(16).max(512).optional(),
  }),
});
