"use client";

import { useActionState } from "react";
import { login } from "./actions";

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState(login, undefined);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="next" value={next ?? "/"} />
      <div>
        <label htmlFor="password" className="label">
          Contraseña
        </label>
        <input id="password" name="password" type="password" autoComplete="current-password" required autoFocus className="input" />
      </div>
      {state?.error ? (
        <p role="alert" className="text-sm text-bad">
          {state.error}
        </p>
      ) : null}
      <button className="btn btn-primary w-full" disabled={pending}>
        {pending ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}
