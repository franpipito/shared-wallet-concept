"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Lock, PartyPopper } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { CategoryDonut, type CategorySlice } from "@/components/category-donut";
import { useAuth } from "@/components/auth-provider";
import { useToast } from "@/components/toast-provider";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FullScreenLoader, Spinner } from "@/components/ui/loader";
import { ProgressBar } from "@/components/ui/progress";
import { Sheet } from "@/components/ui/sheet";
import { ConceptFooter, Screen, ScreenHeader } from "@/components/ui/screen";
import { getAdapter } from "@/lib/data";
import { messageFor } from "@/lib/errors";
import { formatMoney, formatMoneyShort } from "@/lib/format";
import type {
  Movement,
  MovementCategory,
  Profile,
  RefundShare,
  Reserve,
  ReserveMember,
} from "@/lib/types";
import { useLoader } from "@/lib/use-loader";

interface Snapshot {
  reserve: Reserve | null;
  members: ReserveMember[];
  movements: Movement[];
}

export function SummaryScreen({ reserveId, profile }: { reserveId: string; profile: Profile }) {
  const router = useRouter();
  const toast = useToast();
  const { refresh } = useAuth();

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

  const [closeOpen, setCloseOpen] = useState(false);

  // Agregar movimientos para el gráfico es presentación, no cálculo de saldo:
  // los montos ya vienen consolidados del servidor.
  const { slices, spentTotal } = useMemo(() => {
    const byCategory = new Map<MovementCategory, number>();
    let total = 0;
    for (const movement of data?.movements ?? []) {
      if (movement.type !== "expense" || !movement.category) continue;
      byCategory.set(movement.category, (byCategory.get(movement.category) ?? 0) + movement.amount);
      total += movement.amount;
    }
    const result: CategorySlice[] = [...byCategory.entries()]
      .map(([category, value]) => ({ category, total: Math.round(value * 100) / 100 }))
      .sort((a, b) => b.total - a.total);
    return { slices: result, spentTotal: Math.round(total * 100) / 100 };
  }, [data?.movements]);

  if (loading) return <FullScreenLoader />;

  const reserve = data?.reserve;
  if (!reserve) {
    return (
      <Screen>
        <ScreenHeader title="Resumen" onBack={() => router.back()} />
        <main className="flex flex-1 items-center justify-center px-8 text-center">
          <p className="text-sm font-extrabold text-ink-900">No encontramos esta reserva</p>
        </main>
        <ConceptFooter />
      </Screen>
    );
  }

  const members = (data?.members ?? []).filter((m) => m.status === "accepted");
  const isOwner = reserve.myRole === "owner";
  const isClosed = reserve.status === "closed";
  const maxSpent = Math.max(...members.map((m) => m.totalSpent), 1);

  return (
    <Screen>
      <ScreenHeader
        title="Resumen del viaje"
        subtitle={reserve.name}
        onBack={() => router.replace(`/reservas/${reserveId}`)}
        right={<span className="text-2xl">{reserve.emoji}</span>}
      />

      <main className="flex-1 px-4 pb-2">
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Juntaron" value={formatMoneyShort(reserve.totalDeposited)} />
          <Stat label="Gastaron" value={formatMoneyShort(spentTotal)} />
        </div>

        <Card className="mt-3">
          <h2 className="mb-1 text-sm font-extrabold text-ink-700">Gasto por categoría</h2>
          <CategoryDonut slices={slices} total={spentTotal} />
        </Card>

        <Card className="mt-3">
          <h2 className="mb-3 text-sm font-extrabold text-ink-700">Gasto por persona</h2>
          <ul className="flex flex-col gap-3.5">
            {members.map((member) => (
              <li key={member.userId} className="flex items-center gap-3">
                <Avatar name={member.name} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="truncate text-sm font-bold text-ink-900">
                      {member.userId === profile.id ? "Vos" : member.name}
                    </p>
                    <p className="tabular shrink-0 text-sm font-extrabold text-ink-900">
                      {formatMoney(member.totalSpent)}
                    </p>
                  </div>
                  <ProgressBar
                    value={member.totalSpent}
                    goal={maxSpent}
                    className="mt-1.5 h-1.5"
                  />
                  <p className="mt-1 text-[11px] text-ink-500">
                    Aportó {formatMoneyShort(member.totalDeposited)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </Card>

        {isClosed ? (
          <Card className="mt-3 flex items-center gap-3 bg-ink-50">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-ink-100 text-ink-500">
              <Lock className="size-4.5" />
            </span>
            <div>
              <p className="text-sm font-extrabold text-ink-900">Reserva cerrada</p>
              <p className="text-xs text-ink-500">
                El sobrante ya volvió a la billetera de cada uno.
              </p>
            </div>
          </Card>
        ) : (
          <div className="mt-5">
            <Button
              fullWidth
              variant={isOwner ? "primary" : "ghost"}
              disabled={!isOwner}
              onClick={() => setCloseOpen(true)}
            >
              Cerrar reserva y repartir el sobrante
            </Button>
            {!isOwner ? (
              <p className="mt-2 text-center text-[11px] text-ink-300">
                Solo quien creó la reserva puede cerrarla.
              </p>
            ) : null}
          </div>
        )}
      </main>

      <ConceptFooter />

      <CloseReserveSheet
        open={closeOpen}
        onClose={() => setCloseOpen(false)}
        reserveId={reserveId}
        reserveBalance={reserve.balance}
        currentUserId={profile.id}
        onClosed={async () => {
          await refresh();
          await reload();
          toast({
            title: "Reserva cerrada",
            detail: "El sobrante volvió a cada billetera",
            tone: "positive",
          });
        }}
      />
    </Screen>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card className="py-3.5">
      <p className="text-[11px] font-bold uppercase tracking-wide text-ink-300">{label}</p>
      <p className="tabular mt-0.5 text-xl font-extrabold text-ink-900">{value}</p>
    </Card>
  );
}

/**
 * Antes de cerrar se muestra el reparto EXACTO que va a aplicar el servidor:
 * la vista previa y el cierre usan la misma función, así que lo que ve la
 * persona es lo que se acredita.
 */
function CloseReserveSheet({
  open,
  onClose,
  reserveId,
  reserveBalance,
  currentUserId,
  onClosed,
}: {
  open: boolean;
  onClose: () => void;
  reserveId: string;
  reserveBalance: number;
  currentUserId: string;
  onClosed: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RefundShare[] | null>(null);

  const { data: preview, loading } = useLoader<RefundShare[]>(
    async () => (open ? getAdapter().previewCloseReserve(reserveId) : []),
    [reserveId, open],
  );

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      const shares = await getAdapter().closeReserve(reserveId);
      setResult(shares);
      await onClosed();
    } catch (cause) {
      setError(messageFor(cause));
    } finally {
      setBusy(false);
    }
  }

  const shares = result ?? preview ?? [];

  return (
    <Sheet
      open={open}
      onClose={() => {
        if (!busy) {
          setResult(null);
          setError(null);
          onClose();
        }
      }}
      title={result ? "Reserva cerrada" : "Cerrar reserva"}
    >
      <div className="pb-5">
        <AnimatePresence mode="wait">
          {result ? (
            <motion.div
              key="done"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center py-2 text-center"
            >
              <span className="grid size-16 place-items-center rounded-full bg-positive/12 text-positive">
                <PartyPopper className="size-8" />
              </span>
              <p className="mt-4 text-sm font-bold text-ink-700">
                Se devolvió el sobrante a cada billetera.
              </p>
            </motion.div>
          ) : (
            <motion.p
              key="intro"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center text-sm text-ink-500"
            >
              Quedan <strong className="text-ink-900">{formatMoney(reserveBalance)}</strong> sin
              gastar. Se devuelven en proporción a lo que aportó cada uno.
            </motion.p>
          )}
        </AnimatePresence>

        {loading && !result ? (
          <div className="grid place-items-center py-8">
            <Spinner />
          </div>
        ) : (
          <ul className="mt-5 flex flex-col gap-3">
            {shares.map((share) => {
              const pct =
                reserveBalance > 0 ? Math.round((share.refundAmount / reserveBalance) * 100) : 0;
              return (
                <li key={share.userId} className="flex items-center gap-3">
                  <Avatar name={share.name} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-ink-900">
                      {share.userId === currentUserId ? "Vos" : share.name}
                    </p>
                    <p className="text-[11px] text-ink-500">
                      Aportó {formatMoneyShort(share.totalDeposited)} · recibe {pct}%
                    </p>
                  </div>
                  <p className="tabular shrink-0 text-sm font-extrabold text-positive">
                    +{formatMoney(share.refundAmount)}
                  </p>
                </li>
              );
            })}
          </ul>
        )}

        {error ? (
          <p role="alert" className="mt-4 rounded-xl bg-negative/10 px-3 py-2 text-center text-sm font-semibold text-negative">
            {error}
          </p>
        ) : null}

        {result ? (
          <Button
            fullWidth
            className="mt-6"
            onClick={() => {
              setResult(null);
              onClose();
            }}
          >
            Listo
          </Button>
        ) : (
          <div className="mt-6 flex flex-col gap-2">
            <Button fullWidth disabled={busy || loading} onClick={() => void confirm()}>
              {busy ? <Spinner className="size-5 border-white/40 border-t-white" /> : null}
              Confirmar cierre
            </Button>
            <Button variant="ghost" fullWidth disabled={busy} onClick={onClose}>
              Cancelar
            </Button>
            <p className="mt-1 text-center text-[11px] leading-relaxed text-ink-300">
              Una vez cerrada no se puede volver a depositar ni pagar desde esta reserva.
            </p>
          </div>
        )}
      </div>
    </Sheet>
  );
}
