import { redirect } from "next/navigation";
import { isAuthenticated } from "@/server/auth/guard";
import { LoginForm } from "./login-form";
import { Logo } from "@/components/logo";

export const metadata = { title: "Login · Opportunity Hub" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (await isAuthenticated()) redirect("/");
  const { next } = await searchParams;
  const configured = Boolean(process.env.APP_PASSWORD_HASH || (process.env.APP_PASSWORD && process.env.APP_PASSWORD.length >= 10));
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="card w-full max-w-sm p-6">
        <div className="mb-5 flex items-center gap-2">
          <Logo />
          <div>
            <p className="font-semibold">Opportunity Hub</p>
            <p className="text-xs text-muted">Acceso privado</p>
          </div>
        </div>
        {configured ? (
          <LoginForm next={next} />
        ) : (
          <p className="text-sm text-warn">
            No hay contraseña configurada. Define <code>APP_PASSWORD_HASH</code> (o <code>APP_PASSWORD</code>) y <code>AUTH_SECRET</code> en <code>.env</code> y reinicia.
          </p>
        )}
      </div>
    </main>
  );
}
