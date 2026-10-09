"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { createSessionToken, cookieSecure, SESSION_COOKIE, SESSION_TTL_SECONDS, verifyPassword } from "@/server/auth/session";
import { clearLoginAttempts, registerLoginAttempt } from "@/server/auth/rate-limit";

export async function login(_prev: { error?: string } | undefined, formData: FormData): Promise<{ error?: string }> {
  const h = await headers();
  const key = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
  if (!registerLoginAttempt(key)) return { error: "Demasiados intentos. Espera 15 minutos." };
  const password = String(formData.get("password") ?? "");
  if (!verifyPassword(password)) return { error: "Contraseña incorrecta." };
  clearLoginAttempts(key);
  const jar = await cookies();
  jar.set(SESSION_COOKIE, createSessionToken(), {
    httpOnly: true,
    sameSite: "strict",
    secure: cookieSecure(),
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
  const next = String(formData.get("next") ?? "/");
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/");
}

export async function logout() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  redirect("/login");
}
