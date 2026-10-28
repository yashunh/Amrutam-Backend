import { Pool } from "pg";
import { env } from "../config/env";
import { logger } from "../observability/logger";

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: env.NODE_ENV === "test" ? 5 : 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on("error", (error) => {
  logger.error({ err: error }, "Unexpected PostgreSQL pool error");
});
