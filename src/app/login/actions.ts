"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { createSessionToken, cookieSecure, SESSION_COOKIE, SESSION_TTL_SECONDS, verifyPassword } from "@/server/auth/session";
import { clearLoginFailures, isLoginBlocked, registerLoginFailure } from "@/server/auth/rate-limit";
import { loginClientKey, safeRedirectPath } from "@/server/auth/client-key";

const GENERIC_ERROR = "Contraseña incorrecta.";

export async function login(_prev: { error?: string } | undefined, formData: FormData): Promise<{ error?: string }> {
  const key = loginClientKey(await headers());
  if (isLoginBlocked(key)) return { error: "Demasiados intentos fallidos. Espera 15 minutos." };
  const password = String(formData.get("password") ?? "");
  if (password.length > 1024 || !verifyPassword(password)) {
    registerLoginFailure(key);
    console.warn(`[auth] failed login (${key === "direct" ? "direct" : "proxied"})`);
    return { error: GENERIC_ERROR };
  }
  clearLoginFailures(key);
  const jar = await cookies();
  jar.set(SESSION_COOKIE, createSessionToken(), {
    httpOnly: true,
    sameSite: "strict",
    secure: cookieSecure(),
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
  redirect(safeRedirectPath(String(formData.get("next") ?? "/")));
}

export async function logout() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  redirect("/login");
}
