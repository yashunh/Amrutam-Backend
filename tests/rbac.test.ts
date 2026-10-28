import request from "supertest";
import { describe, expect, it } from "vitest";
import { app } from "../src/app";
import { createVerifiedDoctor, registerPatient } from "./helpers";

describe("authorization", () => {
  it("forbids patients from creating doctors", async () => {
    const { res } = await registerPatient(app);
    const attempt = await request(app)
      .post("/v1/admin/doctors")
      .set("Authorization", `Bearer ${res.body.accessToken}`)
      .send({
        email: "x@example.com",
        password: "DoctorPass1234",
        fullName: "Nope",
        specialization: "Ayurveda",
        licenseNumber: "NOPE",
        consultationFee: 1,
      });
    expect(attempt.status).toBe(403);
  });

  it("forbids patients from creating prescriptions", async () => {
    const { res } = await registerPatient(app);
    const attempt = await request(app)
      .post("/v1/consultations/00000000-0000-4000-8000-000000000001/prescriptions")
      .set("Authorization", `Bearer ${res.body.accessToken}`)
      .send({
        diagnosis: "should fail",
        medications: [],
      });
    expect(attempt.status).toBe(403);
  });

  it("forbids a patient from viewing another patient's prescription", async () => {
    const doctor = await createVerifiedDoctor(app);
    const patientA = await registerPatient(app);
    const patientB = await registerPatient(app);
    const booking = await request(app)
      .post("/v1/bookings")
      .set("Authorization", `Bearer ${patientA.res.body.accessToken}`)
      .set("Idempotency-Key", "rbac-book-1-aaaaaaaa")
      .send({ slotId: doctor.slot.id });
    expect(booking.status).toBe(201);

    await request(app)
      .patch(`/v1/consultations/${booking.body.consultation.id}/status`)
      .set("Authorization", `Bearer ${doctor.doctorToken}`)
      .send({ status: "CONFIRMED" });
    await request(app)
      .patch(`/v1/consultations/${booking.body.consultation.id}/status`)
      .set("Authorization", `Bearer ${doctor.doctorToken}`)
      .send({ status: "IN_PROGRESS" });

    const rx = await request(app)
      .post(`/v1/consultations/${booking.body.consultation.id}/prescriptions`)
      .set("Authorization", `Bearer ${doctor.doctorToken}`)
      .send({
        diagnosis: "Vata imbalance",
        medications: [{ name: "Ashwagandha", dosage: "500mg", frequency: "daily" }],
      });
    expect(rx.status).toBe(201);

    const denied = await request(app)
      .get(`/v1/prescriptions/${rx.body.id}`)
      .set("Authorization", `Bearer ${patientB.res.body.accessToken}`);
    expect(denied.status).toBe(403);
  });
});
