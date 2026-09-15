"use client";

import { motion } from "framer-motion";
import { CalendarDays, Target, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FullScreenLoader, Spinner } from "@/components/ui/loader";
import { ConceptFooter, Screen, ScreenHeader } from "@/components/ui/screen";
import { useToast } from "@/components/toast-provider";
import { getAdapter } from "@/lib/data";
import { messageFor } from "@/lib/errors";
import { formatDateRangeLong, formatMoneyShort } from "@/lib/format";
import type { Reserve, ReserveMember } from "@/lib/types";
import { useLoader } from "@/lib/use-loader";

export function InvitationScreen({ reserveId }: { reserveId: string }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<"accept" | "decline" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data, loading } = useLoader<{ reserve: Reserve | null; members: ReserveMember[] }>(
    async () => {
      const adapter = getAdapter();
      const reserve = await adapter.getReserve(reserveId);
      // Un invitado puede ver la reserva y quiénes son, pero todavía no los gastos.
      const members = reserve ? await adapter.getReserveMembers(reserveId) : [];
      return { reserve, members };
    },
    [reserveId],
  );

  if (loading) return <FullScreenLoader />;

  const reserve = data?.reserve ?? null;
  if (!reserve) return <NotFound onBack={() => router.replace("/")} />;

  // Si ya la había respondido, no tiene sentido volver a preguntarle.
  if (reserve.myStatus === "accepted") {
    router.replace(`/reservas/${reserveId}`);
    return <FullScreenLoader />;
  }

  const inviter = data?.members.find((m) => m.role === "owner");
  const accepted = (data?.members ?? []).filter((m) => m.status === "accepted");

  async function respond(accept: boolean) {
    setBusy(accept ? "accept" : "decline");
    setError(null);
    try {
      await getAdapter().respondToInvitation(reserveId, accept);
      if (accept) {
        toast({ title: "¡Listo, ya sos parte!", detail: reserve!.name, tone: "positive" });
        router.replace(`/reservas/${reserveId}`);
      } else {
        router.replace("/");
      }
    } catch (cause) {
      setError(messageFor(cause));
      setBusy(null);
    }
  }

  return (
    <Screen>
      <ScreenHeader title="Invitación" onBack={() => router.replace("/")} />

      <main className="flex flex-1 flex-col justify-center px-4 pb-4">
        <motion.div
          initial={{ opacity: 0, y: 16, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: "spring", stiffness: 180, damping: 22 }}
        >
          <Card className="overflow-hidden p-0">
            <div className="flex flex-col items-center bg-brand-500 px-5 pb-6 pt-7 text-center text-white">
              <span className="grid size-16 place-items-center rounded-3xl bg-white/15 text-4xl">
                {reserve.emoji}
              </span>
              <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-white/70">
                {inviter ? `${inviter.name} te invitó a` : "Te invitaron a"}
              </p>
              <h2 className="mt-1 text-2xl font-extrabold leading-tight">{reserve.name}</h2>
            </div>

            <div className="flex flex-col gap-4 p-5">
              <Row icon={CalendarDays} label="Fechas">
                {formatDateRangeLong(reserve.startsAt, reserve.endsAt)}
              </Row>
              <Row icon={Target} label="Meta">
                {formatMoneyShort(reserve.goalAmount)}
              </Row>
              <Row icon={Users} label={accepted.length === 1 ? "Ya adentro" : "Ya adentro"}>
                <span className="flex items-center gap-1.5">
                  <span className="flex -space-x-2">
                    {accepted.slice(0, 4).map((member) => (
                      <Avatar
                        key={member.userId}
                        name={member.name}
                        size="sm"
                        className="ring-2 ring-surface"
                      />
                    ))}
                  </span>
                  <span className="ml-1">
                    {accepted.length} {accepted.length === 1 ? "persona" : "personas"}
                  </span>
                </span>
              </Row>
            </div>
          </Card>
        </motion.div>

        <p className="mt-5 px-2 text-center text-xs leading-relaxed text-ink-500">
          Al aceptar vas a poder depositar y pagar desde esta reserva. Al cerrarla, el sobrante
          vuelve a cada uno en proporción a lo que puso.
        </p>

        {error ? (
          <p role="alert" className="mt-4 rounded-xl bg-negative/10 px-3 py-2 text-center text-sm font-semibold text-negative">
            {error}
          </p>
        ) : null}

        <div className="mt-6 flex flex-col gap-2">
          <Button fullWidth disabled={busy !== null} onClick={() => void respond(true)}>
            {busy === "accept" ? <Spinner className="size-5 border-white/40 border-t-white" /> : null}
            Aceptar invitación
          </Button>
          <Button variant="ghost" fullWidth disabled={busy !== null} onClick={() => void respond(false)}>
            Ahora no
          </Button>
        </div>
      </main>

      <ConceptFooter className="pt-0" />
    </Screen>
  );
}

function Row({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof Target;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600">
        <Icon className="size-4.5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-bold uppercase tracking-wide text-ink-300">{label}</p>
        <div className="text-sm font-bold text-ink-900">{children}</div>
      </div>
    </div>
  );
}

function NotFound({ onBack }: { onBack: () => void }) {
  return (
    <Screen>
      <ScreenHeader title="Invitación" onBack={onBack} />
      <main className="flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center">
        <span className="text-4xl">🕳️</span>
        <p className="text-sm font-extrabold text-ink-900">Esta invitación ya no está disponible</p>
        <p className="text-xs text-ink-500">Puede que la hayan cancelado o que ya la hayas respondido.</p>
        <Button className="mt-2" onClick={onBack}>
          Ir al inicio
        </Button>
      </main>
      <ConceptFooter />
    </Screen>
  );
}
