import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as { __pg?: ReturnType<typeof postgres> };

function connectionString(): string {
  const url = process.env.DATABASE_URL;
  if (url) return url;
  // `next build` imports route modules without a database; postgres-js connects lazily, so a
  // placeholder is safe there. At runtime a missing DATABASE_URL is always an error.
  if (process.env.NEXT_PHASE === "phase-production-build") return "postgres://build:build@127.0.0.1:1/build";
  throw new Error("DATABASE_URL is not set");
}

// Small pool: this app shares a VM with other services.
export const sqlClient =
  globalForDb.__pg ?? postgres(connectionString(), { max: Number(process.env.DB_POOL_MAX ?? 5), idle_timeout: 30, prepare: true, onnotice: () => {} });
if (process.env.NODE_ENV !== "production") globalForDb.__pg = sqlClient;

export const db = drizzle(sqlClient, { schema });
export type Db = typeof db;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export { schema };
