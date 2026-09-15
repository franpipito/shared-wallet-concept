"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Check, QrCode, ScanLine } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useToast } from "@/components/toast-provider";
import { AmountInput } from "@/components/ui/amount-input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FullScreenLoader, Spinner } from "@/components/ui/loader";
import { ConceptFooter, Screen, ScreenHeader } from "@/components/ui/screen";
import { CATEGORY_META } from "@/lib/categories";
import { getAdapter } from "@/lib/data";
import { randomCharge } from "@/lib/demo-data";
import { messageFor } from "@/lib/errors";
import { formatMoney, parseAmount } from "@/lib/format";
import { CATEGORIES, type MovementCategory, type Profile, type Reserve } from "@/lib/types";
import { useLoader } from "@/lib/use-loader";

type Stage = "scan" | "confirm" | "done";

export function PayScreen({ reserveId, profile }: { reserveId: string; profile: Profile }) {
  const router = useRouter();
  const toast = useToast();

  const { data: reserve, loading } = useLoader<Reserve | null>(
    () => getAdapter().getReserve(reserveId),
    [reserveId],
  );

  const [stage, setStage] = useState<Stage>("scan");
  const [scanning, setScanning] = useState(false);
  const [merchant, setMerchant] = useState("");
  const [amountRaw, setAmountRaw] = useState("");
  const [category, setCategory] = useState<MovementCategory>("otros");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const amount = parseAmount(amountRaw);

  function scan() {
    setScanning(true);
    // Pausa deliberada: sin ella el "escaneo" es instantáneo y no se lee como
    // una cámara reconociendo un código.
    setTimeout(() => {
      const charge = randomCharge();
      setMerchant(charge.merchant);
      setCategory(charge.category);
      setAmountRaw(String(charge.amount));
      setScanning(false);
      setStage("confirm");
    }, 1100);
  }

  async function pay() {
    if (amount === null || amount <= 0) {
      setError("Ingresá un monto mayor a cero.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await getAdapter().spend({
        reserveId,
        amount,
        category,
        merchant,
        description: CATEGORY_META[category].label,
      });
      setStage("done");
      toast({
        title: `Pagaste ${formatMoney(amount)}`,
        detail: merchant,
        tone: "positive",
      });
      // Se deja ver la confirmación antes de volver al detalle.
      setTimeout(() => router.replace(`/reservas/${reserveId}`), 1500);
    } catch (cause) {
      setError(messageFor(cause));
      setBusy(false);
    }
  }

  if (loading) return <FullScreenLoader />;

  if (!reserve || reserve.status !== "active") {
    return (
      <Screen>
        <ScreenHeader title="Pagar" onBack={() => router.back()} />
        <main className="flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center">
          <span className="text-4xl">🔒</span>
          <p className="text-sm font-extrabold text-ink-900">
            {reserve ? "Esta reserva está cerrada" : "No encontramos esta reserva"}
          </p>
          <Button className="mt-2" onClick={() => router.replace("/")}>
            Ir al inicio
          </Button>
        </main>
        <ConceptFooter />
      </Screen>
    );
  }

  return (
    <Screen tone={stage === "scan" ? "brand" : "canvas"}>
      <ScreenHeader
        tone={stage === "scan" ? "brand" : "canvas"}
        title={stage === "done" ? "Pago realizado" : "Pagar con QR"}
        subtitle={stage === "scan" ? reserve.name : undefined}
        onBack={stage === "done" ? undefined : () => router.back()}
      />

      <AnimatePresence mode="wait">
        {stage === "scan" ? (
          <ScanStage key="scan" scanning={scanning} onScan={scan} balance={reserve.balance} />
        ) : null}

        {stage === "confirm" ? (
          <motion.main
            key="confirm"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="flex-1 px-4"
          >
            <Card className="mt-2">
              <div className="flex items-center gap-3">
                <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-brand-50 text-brand-600">
                  <QrCode className="size-6" />
                </span>
                <div className="min-w-0">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-ink-300">
                    Comercio
                  </p>
                  <p className="truncate text-base font-extrabold text-ink-900">{merchant}</p>
                </div>
              </div>

              <div className="mt-5 border-t border-ink-50 pt-5">
                <p className="mb-1 text-center text-[11px] font-bold uppercase tracking-wide text-ink-300">
                  Monto a pagar
                </p>
                <AmountInput
                  value={amountRaw}
                  onChange={(next) => {
                    setAmountRaw(next);
                    setError(null);
                  }}
                />
                <p className="mt-2 text-center text-xs font-semibold text-ink-500">
                  Saldo de la reserva: {formatMoney(reserve.balance)}
                </p>
              </div>
            </Card>

            <div className="mt-4">
              <p className="mb-2 px-1 text-xs font-bold text-ink-700">Categoría</p>
              <div className="flex flex-wrap gap-2">
                {CATEGORIES.map((option) => {
                  const meta = CATEGORY_META[option];
                  const Icon = meta.icon;
                  const selected = option === category;
                  return (
                    <button
                      key={option}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => setCategory(option)}
                      className={`flex items-center gap-1.5 rounded-full px-3.5 py-2.5 text-xs font-bold transition-all ${
                        selected
                          ? "bg-brand-500 text-white shadow-sm"
                          : `${meta.chipClass} hover:brightness-95`
                      }`}
                    >
                      <Icon className="size-3.5" />
                      {meta.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {error ? (
              <p role="alert" className="mt-4 rounded-xl bg-negative/10 px-3 py-2 text-center text-sm font-semibold text-negative">
                {error}
              </p>
            ) : null}

            <div className="mt-6 flex flex-col gap-2">
              <Button fullWidth disabled={busy || amount === null} onClick={() => void pay()}>
                {busy ? <Spinner className="size-5 border-white/40 border-t-white" /> : null}
                Pagar {amount ? formatMoney(amount) : ""}
              </Button>
              <Button variant="ghost" fullWidth disabled={busy} onClick={() => setStage("scan")}>
                Escanear otro
              </Button>
            </div>

            <p className="mt-4 text-center text-[11px] text-ink-300">
              Se descuenta de la reserva compartida, no de tu billetera.
            </p>
          </motion.main>
        ) : null}

        {stage === "done" ? (
          <DoneStage key="done" amount={amount ?? 0} merchant={merchant} payerName={profile.name} />
        ) : null}
      </AnimatePresence>

      {stage !== "scan" ? <ConceptFooter /> : null}
    </Screen>
  );
}

/** Cámara simulada: marco de escaneo + línea que barre. No pide permisos. */
function ScanStage({
  scanning,
  onScan,
  balance,
}: {
  scanning: boolean;
  onScan: () => void;
  balance: number;
}) {
  return (
    <motion.main
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex flex-1 flex-col items-center justify-center px-6 text-white"
    >
      <div className="relative grid size-64 place-items-center rounded-3xl bg-ink-900/55">
        {/* Esquinas del visor */}
        {[
          "left-0 top-0 border-l-4 border-t-4 rounded-tl-2xl",
          "right-0 top-0 border-r-4 border-t-4 rounded-tr-2xl",
          "left-0 bottom-0 border-l-4 border-b-4 rounded-bl-2xl",
          "right-0 bottom-0 border-r-4 border-b-4 rounded-br-2xl",
        ].map((corner) => (
          <span key={corner} className={`absolute size-12 border-accent-400 ${corner}`} />
        ))}

        <QrCode className="size-24 text-white/20" />

        {scanning ? (
          <motion.span
            initial={{ top: "8%" }}
            animate={{ top: "88%" }}
            transition={{ duration: 1, ease: "easeInOut" }}
            className="absolute inset-x-6 h-0.5 bg-accent-400 shadow-[0_0_12px_2px_rgba(255,216,77,0.8)]"
          />
        ) : null}
      </div>

      <p className="mt-8 text-center text-sm font-semibold text-white/85">
        {scanning ? "Leyendo el código…" : "Apuntá al código QR del comercio"}
      </p>
      <p className="mt-1.5 text-center text-xs text-white/60">
        Disponible en la reserva: {formatMoney(balance)}
      </p>

      <Button
        onClick={onScan}
        disabled={scanning}
        className="mt-8 bg-accent-400 text-ink-900 hover:bg-accent-500 active:bg-accent-600"
      >
        <ScanLine className="size-5" />
        {scanning ? "Escaneando…" : "Escanear"}
      </Button>

      <p className="mt-6 max-w-[280px] text-center text-[11px] leading-relaxed text-white/50">
        Cámara simulada: el botón inventa un comercio y un monto de ejemplo.
      </p>
    </motion.main>
  );
}

function DoneStage({
  amount,
  merchant,
  payerName,
}: {
  amount: number;
  merchant: string;
  payerName: string;
}) {
  return (
    <motion.main
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-1 flex-col items-center justify-center px-8 text-center"
    >
      <motion.span
        initial={{ scale: 0.4, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 280, damping: 16 }}
        className="grid size-20 place-items-center rounded-full bg-positive text-white"
      >
        <Check className="size-10" strokeWidth={3} />
      </motion.span>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
      >
        <p className="tabular mt-6 text-3xl font-extrabold text-ink-900">{formatMoney(amount)}</p>
        <p className="mt-1 text-sm font-bold text-ink-700">{merchant}</p>
        <p className="mt-4 text-xs text-ink-500">
          {payerName.split(" ")[0]} pagó desde la reserva compartida
        </p>
      </motion.div>
    </motion.main>
  );
}
