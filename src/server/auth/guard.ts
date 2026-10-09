import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { authBypassEnabled, SESSION_COOKIE, verifySessionToken } from "./session";

export async function isAuthenticated(): Promise<boolean> {
  if (authBypassEnabled()) return true;
  const jar = await cookies();
  return verifySessionToken(jar.get(SESSION_COOKIE)?.value);
}

/** For pages/layouts: redirects to /login when there's no valid session. */
export async function requireUser(): Promise<void> {
  if (!(await isAuthenticated())) redirect("/login");
}

/** For server actions: defense in depth on top of the proxy. */
export async function assertAuthenticated(): Promise<void> {
  if (!(await isAuthenticated())) throw new Error("Unauthorized");
}
