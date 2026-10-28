import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { connectRedis } from "../src/db/redis";
import { app } from "../src/app";

describe("health endpoints", () => {
  beforeAll(async () => {
    await connectRedis();
  });

  it("returns JSON from GET /health", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/application\/json/);
    expect(res.body).toEqual({ status: "ok", service: "amrutam-api" });
    expect(String(res.text).length).toBeGreaterThan(0);
  });

  it("returns JSON from GET /health/ready", async () => {
    const res = await request(app).get("/health/ready");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ready");
    expect(res.body.database).toBe("connected");
    expect(res.body.redis).toBe("connected");
  });

  it("returns 404 JSON for unknown routes", async () => {
    const res = await request(app).get("/does-not-exist");
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });
});
