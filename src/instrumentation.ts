/**
 * Runs once per server start (Node.js runtime only).
 * - Production safety checks (fail fast instead of running insecurely).
 * - Lightweight in-process scheduler for Get on Board sync (no Redis/queues in M0).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  if (process.env.NODE_ENV === "production") {
    if (process.env.AUTH_DISABLED === "true") throw new Error("AUTH_DISABLED=true is not allowed in production");
    if (!process.env.AUTH_SECRET || process.env.AUTH_SECRET.length < 32) throw new Error("AUTH_SECRET (>= 32 chars) is required in production");
    if (!process.env.APP_PASSWORD_HASH && !(process.env.APP_PASSWORD && process.env.APP_PASSWORD.length >= 10)) {
      throw new Error("APP_PASSWORD_HASH or APP_PASSWORD (>= 10 chars) is required in production");
    }
  }

  if (process.env.SCHEDULER_ENABLED === "false") return;
  const { startScheduler } = await import("./server/scheduling/scheduler");
  startScheduler();
}
