import pino from "pino";
import { env } from "../config/env";

export const logger = pino({
  level: env.NODE_ENV === "production" ? "info" : "debug",
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "password",
      "refreshToken",
      "accessToken",
      "token",
      "diagnosis",
      "medications",
      "instructions",
    ],
    censor: "[Redacted]",
  },
});
