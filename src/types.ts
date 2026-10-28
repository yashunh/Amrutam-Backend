import type { Request } from "express";

export type Role = "PATIENT" | "DOCTOR" | "ADMIN";

export type AuthUser = {
  id: string;
  email: string;
  role: Role;
  isActive: boolean;
};

export type AuthenticatedRequest = Request & {
  user: AuthUser;
  requestId: string;
};
