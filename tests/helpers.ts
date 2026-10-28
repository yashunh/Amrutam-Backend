import request from "supertest";
import type { Express } from "express";
import { testAdmin } from "./setup";

export async function registerPatient(
  app: Express,
  overrides?: Partial<{
    email: string;
    password: string;
    fullName: string;
  }>,
) {
  const payload = {
    email: overrides?.email ?? `patient-${Date.now()}-${Math.random()}@example.com`,
    password: overrides?.password ?? "PatientPass1234",
    fullName: overrides?.fullName ?? "Test Patient",
  };
  const res = await request(app).post("/v1/auth/register").send(payload);
  return { res, payload };
}

export async function loginAdmin(app: Express) {
  return request(app).post("/v1/auth/login").send({
    email: testAdmin.email,
    password: testAdmin.password,
  });
}

export async function createVerifiedDoctor(app: Express) {
  const admin = await loginAdmin(app);
  const token = admin.body.accessToken as string;
  const email = `doctor-${Date.now()}-${Math.random()}@example.com`;
  const password = "DoctorPass1234";
  const created = await request(app)
    .post("/v1/admin/doctors")
    .set("Authorization", `Bearer ${token}`)
    .send({
      email,
      password,
      fullName: "Dr Test",
      specialization: "Ayurveda",
      licenseNumber: `LIC-${Date.now()}-${Math.random()}`,
      consultationFee: 500,
    });
  const verified = await request(app)
    .post(`/v1/admin/doctors/${created.body.id}/verify`)
    .set("Authorization", `Bearer ${token}`);
  const login = await request(app).post("/v1/auth/login").send({ email, password });
  const startsAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const endsAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
  const slot = await request(app)
    .post("/v1/doctors/me/availability")
    .set("Authorization", `Bearer ${login.body.accessToken}`)
    .send({ startsAt, endsAt });
  return {
    adminToken: token,
    doctor: verified.body,
    doctorToken: login.body.accessToken as string,
    slot: slot.body,
    email,
    password,
  };
}
