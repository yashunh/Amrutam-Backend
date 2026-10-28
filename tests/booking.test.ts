import request from "supertest";
import { describe, expect, it } from "vitest";
import { app } from "../src/app";
import { createVerifiedDoctor, registerPatient } from "./helpers";

describe("booking", () => {
  it("creates doctor availability and books a slot", async () => {
    const doctor = await createVerifiedDoctor(app);
    expect(doctor.slot.id).toBeTruthy();
    const patient = await registerPatient(app);
    const booked = await request(app)
      .post("/v1/bookings")
      .set("Authorization", `Bearer ${patient.res.body.accessToken}`)
      .set("Idempotency-Key", "book-happy-path-key-01")
      .send({ slotId: doctor.slot.id, reason: "Follow up" });
    expect(booked.status).toBe(201);
    expect(booked.body.consultation.slotId).toBe(doctor.slot.id);
    expect(booked.body.payment.status).toBe("PENDING");
  });

  it("rejects concurrent bookings of the same slot", async () => {
    const doctor = await createVerifiedDoctor(app);
    const a = await registerPatient(app);
    const b = await registerPatient(app);
    const [first, second] = await Promise.all([
      request(app)
        .post("/v1/bookings")
        .set("Authorization", `Bearer ${a.res.body.accessToken}`)
        .set("Idempotency-Key", "concurrent-a-key-0001")
        .send({ slotId: doctor.slot.id }),
      request(app)
        .post("/v1/bookings")
        .set("Authorization", `Bearer ${b.res.body.accessToken}`)
        .set("Idempotency-Key", "concurrent-b-key-0001")
        .send({ slotId: doctor.slot.id }),
    ]);
    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([201, 409]);
  });

  it("replays identical idempotent booking retries", async () => {
    const doctor = await createVerifiedDoctor(app);
    const patient = await registerPatient(app);
    const headers = {
      Authorization: `Bearer ${patient.res.body.accessToken}`,
      "Idempotency-Key": "idempotent-retry-key-01",
    };
    const first = await request(app)
      .post("/v1/bookings")
      .set(headers)
      .send({ slotId: doctor.slot.id, reason: "Repeat" });
    const retry = await request(app)
      .post("/v1/bookings")
      .set(headers)
      .send({ slotId: doctor.slot.id, reason: "Repeat" });
    expect(first.status).toBe(201);
    expect(retry.status).toBe(201);
    expect(retry.body.consultation.id).toBe(first.body.consultation.id);

    const conflict = await request(app)
      .post("/v1/bookings")
      .set(headers)
      .send({ slotId: doctor.slot.id, reason: "Different" });
    expect(conflict.status).toBe(409);
    expect(conflict.body.error.code).toBe("IDEMPOTENCY_KEY_REUSED");
  });
});
