import Link from "next/link";
import { Menu, Plus } from "lucide-react";
import { count, eq, and } from "drizzle-orm";
import { requireUser } from "@/server/auth/guard";
import { authBypassEnabled } from "@/server/auth/session";
import { db, schema } from "@/server/db/client";
import { purgeExpiredUpworkContent } from "@/server/connectors/upwork/retention";
import { NavLinks } from "@/components/nav-links";
import { Logo } from "@/components/logo";
import { logout } from "../login/actions";

export const dynamic = "force-dynamic";

async function navCounts() {
  const [[newOpps], [unread]] = await Promise.all([
    db.select({ n: count() }).from(schema.opportunities).where(eq(schema.opportunities.status, "new")),
    db.select({ n: count() }).from(schema.messages).where(and(eq(schema.messages.read, false))),
  ]);
  return { "/opportunities": newOpps.n, "/inbox": unread.n };
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireUser();
  await purgeExpiredUpworkContent();
  const counts = await navCounts();
  const sidebar = (
    <>
      <Link href="/" className="flex items-center gap-2 px-2.5 pb-4">
        <Logo />
        <div className="leading-tight">
          <p className="text-sm font-semibold">Opportunity Hub</p>
          <p className="text-[11px] text-subtle">M0 · privado</p>
        </div>
      </Link>
      <Link href="/opportunities/new" className="btn btn-primary mb-4 w-full">
        <Plus size={14} /> Importar oportunidad
      </Link>
      <NavLinks counts={counts} />
      <div className="mt-auto space-y-2 px-2.5 pt-6 text-[11px] text-subtle">
        {authBypassEnabled() ? <p className="text-warn">Modo demo sin login (sólo desarrollo)</p> : null}
        <p>Nada se envía fuera sin tu aprobación.</p>
        <form action={logout}>
          <button className="text-muted underline-offset-2 hover:text-fg hover:underline">Cerrar sesión</button>
        </form>
      </div>
    </>
  );
  return (
    <div className="min-h-dvh lg:flex">
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-line bg-surface/60 p-3 lg:flex">{sidebar}</aside>
      <details className="group border-b border-line bg-surface lg:hidden">
        <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3">
          <span className="flex items-center gap-2 text-sm font-semibold">
            <Logo /> Opportunity Hub
          </span>
          <Menu size={18} aria-label="Menú" />
        </summary>
        <div className="flex flex-col px-3 pb-4">{sidebar}</div>
      </details>
      <main className="min-w-0 flex-1 px-4 py-5 sm:px-6 lg:px-8">{children}</main>
    </div>
  );
}
