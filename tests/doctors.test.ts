import request from "supertest";
import { describe, expect, it } from "vitest";
import { app } from "../src/app";
import { createVerifiedDoctor } from "./helpers";

describe("doctor search", () => {
  it("filters by availability and paginates results", async () => {
    const doctor = await createVerifiedDoctor(app);
    const result = await request(app).get("/v1/doctors").query({
      specialization: "Ayurveda",
      availableFrom: doctor.slot.startsAt,
      availableTo: doctor.slot.endsAt,
      page: "1",
      pageSize: "1",
    });

    expect(result.status).toBe(200);
    expect(result.body.total).toBe(1);
    expect(result.body.items).toHaveLength(1);
    expect(result.body.items[0].id).toBe(doctor.doctor.id);
    expect(result.body.page).toBe(1);
    expect(result.body.pageSize).toBe(1);
  });

  it("rejects incomplete or invalid search and pagination parameters", async () => {
    const invalidRange = await request(app)
      .get("/v1/doctors")
      .query({ availableFrom: new Date().toISOString() });
    expect(invalidRange.status).toBe(400);
    expect(invalidRange.body.error.code).toBe("VALIDATION_ERROR");

    const invalidDate = await request(app)
      .get("/v1/doctors")
      .query({ availableFrom: "not-a-date", availableTo: "also-not-a-date" });
    expect(invalidDate.status).toBe(400);

    const invalidPage = await request(app)
      .get("/v1/doctors")
      .query({ page: "not-a-number" });
    expect(invalidPage.status).toBe(400);
  });
});
