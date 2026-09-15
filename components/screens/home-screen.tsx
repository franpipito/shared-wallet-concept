"use client";

import { motion } from "framer-motion";
import {
  ArrowDownToLine,
  ArrowUpRight,
  Eye,
  EyeOff,
  LogOut,
  Plus,
  QrCode,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Spinner } from "@/components/ui/loader";
import { ProgressBar } from "@/components/ui/progress";
import { ConceptFooter, Screen } from "@/components/ui/screen";
import { getAdapter } from "@/lib/data";
import { daysRemaining, formatDateRange, formatMoney, formatMoneyShort } from "@/lib/format";
import type { Profile, Reserve } from "@/lib/types";
import { useLoader } from "@/lib/use-loader";

export function HomeScreen({ profile }: { profile: Profile }) {
  const { signOut } = useAuth();
  const [hidden, setHidden] = useState(false);
  const { data: reserves, loading } = useLoader<Reserve[]>(
    () => getAdapter().getMyReserves(),
    [profile.id],
  );

  const invitations = (reserves ?? []).filter((r) => r.myStatus === "invited");
  const active = (reserves ?? []).filter((r) => r.myStatus === "accepted" && r.status === "active");
  const closed = (reserves ?? []).filter((r) => r.myStatus === "accepted" && r.status === "closed");

  return (
    <Screen>
      {/* Cabecera azul con el saldo de la billetera personal. */}
      <div className="rounded-b-[28px] bg-brand-500 px-5 pb-7 pt-safe text-white">
        <div className="flex items-center gap-3 py-3">
          <Avatar name={profile.name} className="ring-2 ring-white/30" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold">Hola, {profile.name.split(" ")[0]}</p>
            <p className="truncate text-xs text-white/70">{profile.alias}</p>
          </div>
          <button
            type="button"
            onClick={() => void signOut()}
            aria-label="Cerrar sesión"
            className="grid size-9 place-items-center rounded-full transition-colors hover:bg-white/15"
          >
            <LogOut className="size-4.5" />
          </button>
        </div>

        <div className="mt-3">
          <div className="flex items-center gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-white/70">
              Dinero disponible
            </p>
            <button
              type="button"
              onClick={() => setHidden((v) => !v)}
              aria-label={hidden ? "Mostrar saldo" : "Ocultar saldo"}
              className="grid size-6 place-items-center rounded-full text-white/70 transition-colors hover:bg-white/15"
            >
              {hidden ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
            </button>
          </div>
          <motion.p
            key={profile.walletBalance}
            initial={{ opacity: 0.4, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="tabular mt-1 text-[34px] font-extrabold leading-none"
          >
            {hidden ? "$ ••••••" : formatMoney(profile.walletBalance)}
          </motion.p>
          <p className="mt-1.5 text-[11px] text-white/60">Saldo simulado · no es dinero real</p>
        </div>

        <div className="mt-6 flex justify-between gap-2">
          <QuickAction icon={ArrowDownToLine} label="Ingresar" />
          <QuickAction icon={ArrowUpRight} label="Transferir" />
          <QuickAction icon={QrCode} label="Pagar" />
          <QuickAction icon={Users} label="Reservas" href="#reservas" highlight />
        </div>
      </div>

      <main id="reservas" className="flex-1 px-4 pt-5">
        {invitations.length > 0 ? (
          <section className="mb-5">
            <SectionTitle>Te invitaron</SectionTitle>
            <div className="flex flex-col gap-2.5">
              {invitations.map((reserve) => (
                <InvitationCard key={reserve.id} reserve={reserve} />
              ))}
            </div>
          </section>
        ) : null}

        <section>
          <div className="mb-2.5 flex items-end justify-between">
            <SectionTitle className="mb-0">Reservas compartidas</SectionTitle>
            <Link
              href="/reservas/nueva"
              className="flex items-center gap-1 text-sm font-bold text-brand-600"
            >
              <Plus className="size-4" />
              Crear
            </Link>
          </div>

          {loading ? (
            <div className="grid place-items-center py-10">
              <Spinner />
            </div>
          ) : active.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="flex flex-col gap-3">
              {active.map((reserve, index) => (
                <ReserveCard key={reserve.id} reserve={reserve} index={index} />
              ))}
            </div>
          )}
        </section>

        {closed.length > 0 ? (
          <section className="mt-6">
            <SectionTitle>Cerradas</SectionTitle>
            <div className="flex flex-col gap-2.5">
              {closed.map((reserve) => (
                <Link key={reserve.id} href={`/reservas/${reserve.id}`}>
                  <Card className="flex items-center gap-3 opacity-70">
                    <span className="text-xl">{reserve.emoji}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-ink-900">{reserve.name}</p>
                      <p className="text-xs text-ink-500">Cerrada</p>
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          </section>
        ) : null}
      </main>

      <ConceptFooter />
    </Screen>
  );
}

function SectionTitle({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <h2 className={`mb-2.5 text-sm font-extrabold text-ink-700 ${className}`}>{children}</h2>
  );
}

function QuickAction({
  icon: Icon,
  label,
  href,
  highlight,
}: {
  icon: typeof QrCode;
  label: string;
  href?: string;
  highlight?: boolean;
}) {
  const content = (
    <>
      <span
        className={`grid size-12 place-items-center rounded-2xl transition-colors ${
          highlight ? "bg-accent-400 text-ink-900" : "bg-white/15 text-white"
        }`}
      >
        <Icon className="size-5" />
      </span>
      <span className="text-[11px] font-semibold text-white/85">{label}</span>
    </>
  );

  const className = "flex w-16 flex-col items-center gap-1.5";
  return href ? (
    <a href={href} className={className}>
      {content}
    </a>
  ) : (
    // Accesos de la billetera que quedan fuera del alcance del concepto.
    <button type="button" disabled className={`${className} cursor-default`} aria-disabled>
      {content}
    </button>
  );
}

function ReserveCard({ reserve, index }: { reserve: Reserve; index: number }) {
  const days = daysRemaining(reserve.endsAt);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06, duration: 0.3 }}
    >
      <Link href={`/reservas/${reserve.id}`} className="block">
        <Card className="transition-transform active:scale-[0.99]">
          <div className="flex items-start gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-brand-50 text-xl">
              {reserve.emoji}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-extrabold text-ink-900">{reserve.name}</p>
              <p className="truncate text-xs text-ink-500">
                {formatDateRange(reserve.startsAt, reserve.endsAt)} ·{" "}
                {reserve.memberCount} {reserve.memberCount === 1 ? "persona" : "personas"}
              </p>
            </div>
            {days >= 0 ? (
              <span className="shrink-0 rounded-full bg-accent-200 px-2.5 py-1 text-[11px] font-bold text-[#8a6d00]">
                {days === 0 ? "Último día" : `${days} d`}
              </span>
            ) : null}
          </div>

          <div className="mt-4">
            <div className="flex items-baseline justify-between">
              <p className="tabular text-2xl font-extrabold text-ink-900">
                {formatMoney(reserve.balance)}
              </p>
              <p className="text-xs font-semibold text-ink-500">
                meta {formatMoneyShort(reserve.goalAmount)}
              </p>
            </div>
            {/* La barra mide lo APORTADO contra la meta, no el saldo: gastar
                no debería hacer retroceder el progreso del ahorro. */}
            <ProgressBar
              value={reserve.totalDeposited}
              goal={reserve.goalAmount}
              className="mt-2.5"
            />
          </div>
        </Card>
      </Link>
    </motion.div>
  );
}

function InvitationCard({ reserve }: { reserve: Reserve }) {
  return (
    <Link href={`/invitaciones/${reserve.id}`} className="block">
      <Card className="flex items-center gap-3 border-2 border-accent-400 bg-accent-200/40">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-white text-xl">
          {reserve.emoji}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-extrabold text-ink-900">{reserve.name}</p>
          <p className="truncate text-xs text-ink-700">
            {reserve.inviterName ? `${reserve.inviterName} te invitó` : "Invitación pendiente"}
          </p>
        </div>
        <Button className="min-h-9 px-3.5 text-xs">Ver</Button>
      </Card>
    </Link>
  );
}

function EmptyState() {
  return (
    <Card className="flex flex-col items-center gap-3 py-8 text-center">
      <span className="grid size-14 place-items-center rounded-full bg-brand-50 text-2xl">🧳</span>
      <div>
        <p className="text-sm font-extrabold text-ink-900">Todavía no tenés reservas</p>
        <p className="mx-auto mt-1 max-w-[260px] text-xs leading-relaxed text-ink-500">
          Una reserva compartida junta la plata de varias personas para un gasto en común y
          devuelve el sobrante al terminar.
        </p>
      </div>
      <Link href="/reservas/nueva">
        <Button className="mt-1">Crear mi primera reserva</Button>
      </Link>
    </Card>
  );
}
