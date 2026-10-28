import request from "supertest";
import { describe, expect, it } from "vitest";
import { app } from "../src/app";
import { createVerifiedDoctor, registerPatient } from "./helpers";

describe("payments", () => {
  it("enforces consultation ownership and payment state rules", async () => {
    const doctor = await createVerifiedDoctor(app);
    const owner = await registerPatient(app);
    const otherPatient = await registerPatient(app);
    const booking = await request(app)
      .post("/v1/bookings")
      .set("Authorization", `Bearer ${owner.res.body.accessToken}`)
      .set("Idempotency-Key", "payment-ownership-key-01")
      .send({ slotId: doctor.slot.id });
    expect(booking.status).toBe(201);
    const paymentId = booking.body.payment.id as string;

    const denied = await request(app)
      .get(`/v1/payments/${paymentId}`)
      .set("Authorization", `Bearer ${otherPatient.res.body.accessToken}`);
    expect(denied.status).toBe(403);

    const paid = await request(app)
      .post(`/v1/payments/${paymentId}/simulate`)
      .set("Authorization", `Bearer ${owner.res.body.accessToken}`)
      .send({ outcome: "SUCCEEDED" });
    expect(paid.status).toBe(200);
    expect(paid.body.status).toBe("SUCCEEDED");
    expect(paid.body.collected).toBe(true);

    const repeated = await request(app)
      .post(`/v1/payments/${paymentId}/simulate`)
      .set("Authorization", `Bearer ${owner.res.body.accessToken}`)
      .send({ outcome: "SUCCEEDED" });
    expect(repeated.status).toBe(200);
    expect(repeated.body.id).toBe(paymentId);

    const invalidTransition = await request(app)
      .post(`/v1/payments/${paymentId}/simulate`)
      .set("Authorization", `Bearer ${owner.res.body.accessToken}`)
      .send({ outcome: "FAILED" });
    expect(invalidTransition.status).toBe(409);
    expect(invalidTransition.body.error.code).toBe("PAYMENT_FINAL");
  });
});
