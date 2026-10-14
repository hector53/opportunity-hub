const WINDOW_MS = 15 * 60 * 1000;
export const MAX_FAILURES_PER_KEY = 5;
export const MAX_FAILURES_GLOBAL = 30;

const failures = new Map<string, number[]>();
let globalFailures: number[] = [];

const recent = (list: number[], now: number) => list.filter((t) => now - t < WINDOW_MS);

/**
 * In-memory login throttle for this single-instance app. Only FAILED attempts count.
 * Two limits: per client key (5 / 15 min) and global (30 / 15 min). The global limit caps
 * distributed or header-spoofing attempts even if the per-key identity can be varied.
 */
export function isLoginBlocked(key: string, now = Date.now()): boolean {
  globalFailures = recent(globalFailures, now);
  const list = recent(failures.get(key) ?? [], now);
  failures.set(key, list);
  return list.length >= MAX_FAILURES_PER_KEY || globalFailures.length >= MAX_FAILURES_GLOBAL;
}

export function registerLoginFailure(key: string, now = Date.now()) {
  failures.set(key, [...recent(failures.get(key) ?? [], now), now]);
  globalFailures = [...recent(globalFailures, now), now];
}

export function clearLoginFailures(key: string) {
  failures.delete(key);
}

/** Test helper. */
export function resetLoginThrottle() {
  failures.clear();
  globalFailures = [];
}
