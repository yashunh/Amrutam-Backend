import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import pinoHttp from "pino-http";
import { env } from "./config/env";
import { pool } from "./db/pool";
import { redisHealth } from "./db/redis";
import { errorHandler } from "./middleware/error-handler";
import { requestId } from "./middleware/request-id";
import { adminRouter } from "./modules/admin/admin.routes";
import { authRouter } from "./modules/auth/auth.routes";
import { bookingsRouter } from "./modules/bookings/bookings.routes";
import { consultationsRouter } from "./modules/consultations/consultations.routes";
import {
  adminDoctorsRouter,
  doctorsRouter,
} from "./modules/doctors/doctors.routes";
import { paymentsRouter } from "./modules/payments/payments.routes";
import {
  consultationPrescriptionsRouter,
  prescriptionsRouter,
} from "./modules/prescriptions/prescriptions.routes";
import { logger } from "./observability/logger";
import { metricsMiddleware, metricsRegistry } from "./observability/metrics";
import { AppError } from "./utils/errors";

const corsOrigins = env.CORS_ORIGIN.split(",").map((origin) => origin.trim());

export function serializeResponseForLog(res: { statusCode: number }) {
  return { statusCode: res.statusCode };
}

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);

  app.use(
    helmet({
      contentSecurityPolicy: false,
    }),
  );
  app.use(
    cors({
      origin: corsOrigins,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: "100kb" }));
  app.use(cookieParser());
  app.use(requestId);
  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => req.requestId,
      serializers: {
        req(req) {
          return {
            id: req.id,
            method: req.method,
            url: req.url,
          };
        },
        res: serializeResponseForLog,
      },
    }),
  );
  app.use(metricsMiddleware);

  const sendLiveness = (_req: express.Request, res: express.Response) => {
    res.status(200);
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.end(JSON.stringify({ status: "ok", service: "amrutam-api" }));
  };

  app.get("/health", sendLiveness);
  app.head("/health", (_req, res) => {
    res.status(200);
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end();
  });

  app.get("/health/ready", async (_req, res) => {
    try {
      await pool.query("SELECT 1");
      const redisOk = await redisHealth();
      const ready = redisOk;
      res.status(ready ? 200 : 503);
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(
        JSON.stringify({
          status: ready ? "ready" : "not_ready",
          database: "connected",
          redis: redisOk ? "connected" : "disconnected",
        }),
      );
    } catch {
      res.status(503);
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(
        JSON.stringify({
          status: "not_ready",
          database: "disconnected",
        }),
      );
    }
  });

  app.get("/metrics", async (_req, res) => {
    res.setHeader("Content-Type", metricsRegistry.contentType);
    res.end(await metricsRegistry.metrics());
  });

  app.get("/", (_req, res) => {
    res.json({
      name: "Amrutam Telemedicine API",
      version: "1.0.0",
    });
  });

  app.use("/v1/auth", authRouter);
  app.use("/v1/doctors", doctorsRouter);
  app.use("/v1/admin/doctors", adminDoctorsRouter);
  app.use("/v1/bookings", bookingsRouter);
  app.use("/v1/appointments", bookingsRouter);
  app.use("/v1/consultations/:id/prescriptions", consultationPrescriptionsRouter);
  app.use("/v1/consultations", consultationsRouter);
  app.use("/v1/prescriptions", prescriptionsRouter);
  app.use("/v1/payments", paymentsRouter);
  app.use("/v1/admin", adminRouter);

  app.use((_req, _res, next) => {
    next(new AppError(404, "NOT_FOUND", "Route not found"));
  });
  app.use(errorHandler);
  return app;
}

export const app = createApp();
