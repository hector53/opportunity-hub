const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const attempts = new Map<string, number[]>();

/** In-memory login throttle (single instance app). Returns false when the caller is blocked. */
export function registerLoginAttempt(key: string, now = Date.now()): boolean {
  const list = (attempts.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (list.length >= MAX_ATTEMPTS) {
    attempts.set(key, list);
    return false;
  }
  list.push(now);
  attempts.set(key, list);
  return true;
}

export function clearLoginAttempts(key: string) {
  attempts.delete(key);
}
