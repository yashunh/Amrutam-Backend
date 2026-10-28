import request from "supertest";
import { describe, expect, it } from "vitest";
import { app } from "../src/app";
import { registerPatient } from "./helpers";

describe("auth", () => {
  it("registers a patient and ignores any submitted role", async () => {
    const { res } = await registerPatient(app);
    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe("PATIENT");
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.refreshToken).toBeTruthy();
  });

  it("rejects duplicate emails", async () => {
    const email = `dup-${Date.now()}@example.com`;
    const first = await registerPatient(app, { email });
    expect(first.res.status).toBe(201);
    const second = await registerPatient(app, { email });
    expect(second.res.status).toBe(409);
    expect(second.res.body.error.code).toBe("EMAIL_TAKEN");
  });

  it("logs in with correct credentials and rejects incorrect ones", async () => {
    const { payload } = await registerPatient(app);
    const ok = await request(app).post("/v1/auth/login").send({
      email: payload.email,
      password: payload.password,
    });
    expect(ok.status).toBe(200);
    expect(ok.body.accessToken).toBeTruthy();

    const bad = await request(app).post("/v1/auth/login").send({
      email: payload.email,
      password: "wrong-password-99",
    });
    expect(bad.status).toBe(401);
    expect(bad.body.error.code).toBe("INVALID_CREDENTIALS");
  });

  it("requires JWT for /v1/auth/me and accepts a valid token", async () => {
    const { res } = await registerPatient(app);
    const denied = await request(app).get("/v1/auth/me");
    expect(denied.status).toBe(401);

    const invalid = await request(app)
      .get("/v1/auth/me")
      .set("Authorization", "Bearer invalid.token.value");
    expect(invalid.status).toBe(401);

    const me = await request(app)
      .get("/v1/auth/me")
      .set("Authorization", `Bearer ${res.body.accessToken}`);
    expect(me.status).toBe(200);
    expect(me.body.email).toBe(res.body.user.email);
  });

  it("rotates refresh tokens and rejects reuse", async () => {
    const { res } = await registerPatient(app);
    const first = await request(app)
      .post("/v1/auth/refresh")
      .send({ refreshToken: res.body.refreshToken });
    expect(first.status).toBe(200);
    expect(first.body.refreshToken).not.toBe(res.body.refreshToken);

    const reuse = await request(app)
      .post("/v1/auth/refresh")
      .send({ refreshToken: res.body.refreshToken });
    expect(reuse.status).toBe(401);
    expect(reuse.body.error.code).toBe("REFRESH_REUSE");
  });

  it("revokes a refresh token on logout", async () => {
    const { res } = await registerPatient(app);
    const logout = await request(app)
      .post("/v1/auth/logout")
      .send({ refreshToken: res.body.refreshToken });
    expect(logout.status).toBe(204);

    const refresh = await request(app)
      .post("/v1/auth/refresh")
      .send({ refreshToken: res.body.refreshToken });
    expect(refresh.status).toBe(401);
  });

  it("returns validation errors for short passwords", async () => {
    const res = await request(app).post("/v1/auth/register").send({
      email: "not-an-email",
      password: "short",
      fullName: "A",
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});
