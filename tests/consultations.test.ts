import request from "supertest";
import { describe, expect, it } from "vitest";
import { app } from "../src/app";
import { createVerifiedDoctor, registerPatient } from "./helpers";

describe("consultations", () => {
  it("transitions status along the allowed lifecycle", async () => {
    const doctor = await createVerifiedDoctor(app);
    const patient = await registerPatient(app);
    const booked = await request(app)
      .post("/v1/bookings")
      .set("Authorization", `Bearer ${patient.res.body.accessToken}`)
      .set("Idempotency-Key", "consult-flow-key-0001")
      .send({ slotId: doctor.slot.id });
    const id = booked.body.consultation.id as string;

    const confirmed = await request(app)
      .patch(`/v1/consultations/${id}/status`)
      .set("Authorization", `Bearer ${doctor.doctorToken}`)
      .send({ status: "CONFIRMED" });
    expect(confirmed.body.status).toBe("CONFIRMED");

    const started = await request(app)
      .patch(`/v1/consultations/${id}/status`)
      .set("Authorization", `Bearer ${doctor.doctorToken}`)
      .send({ status: "IN_PROGRESS" });
    expect(started.body.status).toBe("IN_PROGRESS");

    const completed = await request(app)
      .patch(`/v1/consultations/${id}/status`)
      .set("Authorization", `Bearer ${doctor.doctorToken}`)
      .send({ status: "COMPLETED" });
    expect(completed.body.status).toBe("COMPLETED");

    const invalid = await request(app)
      .patch(`/v1/consultations/${id}/status`)
      .set("Authorization", `Bearer ${doctor.doctorToken}`)
      .send({ status: "CONFIRMED" });
    expect(invalid.status).toBe(409);

    const patientAttempt = await request(app)
      .patch(`/v1/consultations/${id}/status`)
      .set("Authorization", `Bearer ${patient.res.body.accessToken}`)
      .send({ status: "CONFIRMED" });
    expect(patientAttempt.status).toBe(403);
  });
});
