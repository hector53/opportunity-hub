// Applies pending SQL migrations from ./drizzle. Used by the container entrypoint and `npm run db:migrate`.
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}
const client = postgres(url, { max: 1, onnotice: () => {} });
try {
  await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
  console.log("[migrate] migrations applied");
} catch (e) {
  console.error("[migrate] failed", e);
  process.exitCode = 1;
} finally {
  await client.end();
}
