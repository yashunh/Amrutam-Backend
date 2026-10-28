import { readFile } from "node:fs/promises";
import path from "node:path";
import { Client } from "pg";
import { env } from "../config/env";

async function main(): Promise<void> {
  const fileName = process.argv[2] === "full" ? "schema.sql" : "additive.sql";
  const filePath = path.join(__dirname, fileName);
  const sql = await readFile(filePath, "utf8");
  const client = new Client({ connectionString: env.DATABASE_URL });
  await client.connect();
  try {
    await client.query(sql);
    process.stdout.write(`Applied ${fileName}\n`);
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown error";
  process.stderr.write(`Failed to apply schema: ${message}\n`);
  process.exit(1);
});
