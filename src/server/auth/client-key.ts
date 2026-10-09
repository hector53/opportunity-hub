type HeaderGetter = { get(name: string): string | null };

/**
 * Identity used for login throttling.
 *
 * Forwarding headers (X-Forwarded-For, X-Real-IP) are client-controlled unless a trusted reverse
 * proxy overwrites them, so they are IGNORED by default. Set TRUST_PROXY=true only when the app is
 * reachable exclusively through a reverse proxy you control that sets these headers.
 * With TRUST_PROXY, X-Real-IP is preferred; otherwise the LAST X-Forwarded-For entry (the one
 * appended by the nearest proxy) is used — never the first, which the client can forge.
 */
export function loginClientKey(headers: HeaderGetter, env: Record<string, string | undefined> = process.env): string {
  if (env.TRUST_PROXY !== "true") return "direct";
  const real = headers.get("x-real-ip")?.trim();
  if (real) return `ip:${real}`;
  const xff = headers.get("x-forwarded-for");
  const last = xff?.split(",").map((s) => s.trim()).filter(Boolean).pop();
  return last ? `ip:${last}` : "direct";
}

/** Only same-app relative paths: rejects "//host", "/\host", schemes and control characters. */
export function safeRedirectPath(next: string | null | undefined): string {
  if (!next) return "/";
  if (!/^\/(?![/\\])/.test(next)) return "/";
  if (/[\u0000-\u001f\u007f\\]/.test(next)) return "/";
  try {
    const u = new URL(next, "http://local.invalid");
    if (u.origin !== "http://local.invalid") return "/";
    return `${u.pathname}${u.search}${u.hash}`;
  } catch {
    return "/";
  }
}
