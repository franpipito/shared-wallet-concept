"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowDownToLine, PieChart, QrCode } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DepositSheet } from "@/components/deposit-sheet";
import { MovementRow } from "@/components/movement-row";
import { useToast } from "@/components/toast-provider";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FullScreenLoader } from "@/components/ui/loader";
import { ProgressBar } from "@/components/ui/progress";
import { ConceptFooter, Screen, ScreenHeader } from "@/components/ui/screen";
import { CATEGORY_META } from "@/lib/categories";
import { getAdapter } from "@/lib/data";
import {
  daysRemaining,
  formatDateRange,
  formatMoney,
  formatMoneyShort,
} from "@/lib/format";
import type { Movement, Profile, Reserve, ReserveMember } from "@/lib/types";
import { useLoader } from "@/lib/use-loader";

interface Snapshot {
  reserve: Reserve | null;
  members: ReserveMember[];
  movements: Movement[];
}

export function ReserveDetailScreen({
  reserveId,
  profile,
}: {
  reserveId: string;
  profile: Profile;
}) {
  const router = useRouter();
  const toast = useToast();
  const [depositOpen, setDepositOpen] = useState(false);

  const { data, loading, reload } = useLoader<Snapshot>(async () => {
    const adapter = getAdapter();
    const reserve = await adapter.getReserve(reserveId);
    if (!reserve || reserve.myStatus !== "accepted") {
      return { reserve, members: [], movements: [] };
    }
    const [members, movements] = await Promise.all([
      adapter.getReserveMembers(reserveId),
      adapter.getMovements(reserveId),
    ]);
    return { reserve, members, movements };
  }, [reserveId]);

  // Los movimientos que llegan por realtime se guardan aparte y se mezclan con
  // los del servidor al derivar el feed. Copiarlos a estado dentro de un efecto
  // encadenaría un render extra por cada recarga.
  const [live, setLive] = useState<Movement[]>([]);

  const feed = useMemo(() => {
    const base = data?.movements ?? [];
    const known = new Set(base.map((m) => m.id));
    const pending = live.filter((m) => !known.has(m.id));
    return [...pending, ...base].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [data?.movements, live]);

  const handleMovement = useCallback(
    (movement: Movement, members: ReserveMember[]) => {
      setLive((current) =>
        current.some((m) => m.id === movement.id) ? current : [movement, ...current],
      );

      // Solo avisamos de lo que hizo OTRA persona: de lo propio ya hubo feedback.
      if (movement.userId === profile.id) return;

      const author = members.find((m) => m.userId === movement.userId);
      const name = author?.name.split(" ")[0] ?? "Alguien";
      const category = movement.category ? CATEGORY_META[movement.category].label : null;

      if (movement.type === "expense") {
        toast({
          title: `${name} pagó ${formatMoney(movement.amount)}`,
          detail: [movement.merchant, category].filter(Boolean).join(" · "),
          personName: author?.name ?? name,
        });
      } else if (movement.type === "deposit") {
        toast({
          title: `${name} depositó ${formatMoney(movement.amount)}`,
          detail: "La reserva tiene más fondos",
          personName: author?.name ?? name,
          tone: "positive",
        });
      }
    },
    [profile.id, toast],
  );

  // La suscripción lee los handlers desde refs para crearse UNA sola vez por
  // reserva: si dependiera de ellos se reconectaría en cada render y perdería
  // eventos justo mientras se graba la demo. Los refs se sincronizan en efectos
  // declarados ANTES del de la suscripción, así ya están frescos cuando corre.
  const handlerRef = useRef(handleMovement);
  const membersRef = useRef<ReserveMember[]>([]);
  const reloadRef = useRef(reload);

  useEffect(() => {
    handlerRef.current = handleMovement;
  }, [handleMovement]);

  useEffect(() => {
    membersRef.current = data?.members ?? [];
  }, [data?.members]);

  useEffect(() => {
    reloadRef.current = reload;
  }, [reload]);

  useEffect(() => {
    return getAdapter().subscribeToReserve(reserveId, {
      onMovement: (movement) => handlerRef.current(movement, membersRef.current),
      onReserveChange: () => void reloadRef.current(),
      onMembersChange: () => void reloadRef.current(),
    });
  }, [reserveId]);

  if (loading) return <FullScreenLoader />;

  const reserve = data?.reserve;
  if (!reserve) {
    return (
      <Screen>
        <ScreenHeader title="Reserva" onBack={() => router.replace("/")} />
        <main className="flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center">
          <span className="text-4xl">🕳️</span>
          <p className="text-sm font-extrabold text-ink-900">No encontramos esta reserva</p>
          <Button className="mt-2" onClick={() => router.replace("/")}>
            Ir al inicio
          </Button>
        </main>
        <ConceptFooter />
      </Screen>
    );
  }

  if (reserve.myStatus === "invited") {
    router.replace(`/invitaciones/${reserveId}`);
    return <FullScreenLoader />;
  }

  const members = data?.members ?? [];
  const accepted = members.filter((m) => m.status === "accepted");
  const days = daysRemaining(reserve.endsAt);
  const isClosed = reserve.status === "closed";
  const nameFor = (userId: string) =>
    members.find((m) => m.userId === userId)?.name ?? "Alguien";

  return (
    <Screen>
      {/* ── Cabecera: saldo, avance hacia la meta y días restantes ── */}
      <div className="rounded-b-[28px] bg-brand-500 px-5 pb-6 text-white">
        <ScreenHeader
          tone="brand"
          onBack={() => router.replace("/")}
          title={reserve.name}
          subtitle={formatDateRange(reserve.startsAt, reserve.endsAt)}
          right={<span className="text-2xl">{reserve.emoji}</span>}
        />

        <div className="mt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-white/70">
            Saldo de la reserva
          </p>
          <motion.p
            key={reserve.balance}
            initial={{ opacity: 0.5, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 26 }}
            className="tabular mt-1 text-[38px] font-extrabold leading-none"
          >
            {formatMoney(reserve.balance)}
          </motion.p>
        </div>

        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between text-xs font-semibold">
            <span className="text-white/75">
              Juntaron {formatMoneyShort(reserve.totalDeposited)}
            </span>
            <span className="text-white/60">meta {formatMoneyShort(reserve.goalAmount)}</span>
          </div>
          <ProgressBar value={reserve.totalDeposited} goal={reserve.goalAmount} tone="white" />
        </div>

        <div className="mt-4 flex items-center justify-between">
          <span className="rounded-full bg-white/15 px-3 py-1 text-[11px] font-bold">
            {isClosed
              ? "Reserva cerrada"
              : days < 0
                ? "El viaje terminó"
                : days === 0
                  ? "Último día del viaje"
                  : `Faltan ${days} días`}
          </span>
          <span className="text-[11px] text-white/60">Saldo simulado</span>
        </div>
      </div>

      <main className="flex-1 px-4 pt-5">
        {/* ── Quiénes participan y cuánto puso y gastó cada uno ── */}
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-extrabold text-ink-700">Quiénes participan</h2>
            <span className="text-xs text-ink-300">{accepted.length} personas</span>
          </div>
          <ul className="flex flex-col gap-3">
            {accepted.map((member) => (
              <li key={member.userId} className="flex items-center gap-3">
                <Avatar name={member.name} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-ink-900">
                    {member.userId === profile.id ? "Vos" : member.name}
                    {member.role === "owner" ? (
                      <span className="ml-1.5 rounded-full bg-brand-50 px-1.5 py-0.5 text-[10px] font-bold text-brand-600">
                        creó
                      </span>
                    ) : null}
                  </p>
                  <p className="truncate text-[11px] text-ink-500">
                    Puso {formatMoneyShort(member.totalDeposited)} · gastó{" "}
                    {formatMoneyShort(member.totalSpent)}
                  </p>
                </div>
                <div className="w-20 shrink-0">
                  {/* Cuánto del total aportado puso esta persona. */}
                  <ProgressBar
                    value={member.totalDeposited}
                    goal={Math.max(reserve.totalDeposited, 1)}
                    className="h-1.5"
                  />
                </div>
              </li>
            ))}
          </ul>

          {members.some((m) => m.status === "invited") ? (
            <p className="mt-3 border-t border-ink-50 pt-3 text-[11px] text-ink-300">
              Invitación pendiente:{" "}
              {members.filter((m) => m.status === "invited").map((m) => m.name).join(", ")}
            </p>
          ) : null}
        </Card>

        {/* ── Acciones ── */}
        <div className="mt-4 grid grid-cols-3 gap-2">
          <ActionButton
            icon={ArrowDownToLine}
            label="Depositar"
            onClick={() => setDepositOpen(true)}
            disabled={isClosed}
          />
          <ActionButton
            icon={QrCode}
            label="Pagar"
            href={`/reservas/${reserveId}/pagar`}
            primary
            disabled={isClosed}
          />
          <ActionButton icon={PieChart} label="Resumen" href={`/reservas/${reserveId}/resumen`} />
        </div>

        {/* ── Feed en vivo ── */}
        <section className="mt-6">
          <h2 className="mb-1 text-sm font-extrabold text-ink-700">Movimientos</h2>
          <Card className="px-4 py-0">
            {feed.length === 0 ? (
              <p className="py-8 text-center text-xs text-ink-300">
                Todavía no hay movimientos en esta reserva.
              </p>
            ) : (
              <ul className="divide-y divide-ink-50">
                {/* initial={false}: solo se anima lo que ENTRA después de la
                    carga inicial, que es justo el movimiento del otro celular. */}
                <AnimatePresence initial={false}>
                  {feed.map((movement) => (
                    <motion.li
                      key={movement.id}
                      layout
                      initial={{ opacity: 0, height: 0, scale: 0.97 }}
                      animate={{ opacity: 1, height: "auto", scale: 1 }}
                      transition={{ type: "spring", stiffness: 320, damping: 30 }}
                    >
                      <MovementRow
                        movement={movement}
                        authorName={nameFor(movement.userId)}
                        isMine={movement.userId === profile.id}
                      />
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
            )}
          </Card>
        </section>
      </main>

      <ConceptFooter />

      <DepositSheet
        open={depositOpen}
        onClose={() => setDepositOpen(false)}
        reserveId={reserveId}
        walletBalance={profile.walletBalance}
        onDone={() => void reload()}
      />
    </Screen>
  );
}

function ActionButton({
  icon: Icon,
  label,
  href,
  onClick,
  primary,
  disabled,
}: {
  icon: typeof QrCode;
  label: string;
  href?: string;
  onClick?: () => void;
  primary?: boolean;
  disabled?: boolean;
}) {
  const inner = (
    <span
      className={`flex h-[74px] flex-col items-center justify-center gap-1.5 rounded-card text-xs font-bold transition-transform active:scale-[0.97] ${
        primary ? "bg-brand-500 text-white shadow-sm" : "bg-surface text-ink-700 shadow-card"
      } ${disabled ? "pointer-events-none opacity-45" : ""}`}
    >
      <Icon className="size-5" />
      {label}
    </span>
  );

  if (href && !disabled) {
    return (
      <Link href={href} className="block">
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} disabled={disabled} className="block w-full">
      {inner}
    </button>
  );
}
