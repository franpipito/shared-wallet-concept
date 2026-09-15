"use client";

import { useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { useToast } from "@/components/toast-provider";
import { AmountInput } from "@/components/ui/amount-input";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/loader";
import { Sheet } from "@/components/ui/sheet";
import { getAdapter } from "@/lib/data";
import { messageFor } from "@/lib/errors";
import { formatMoney, formatMoneyShort, parseAmount } from "@/lib/format";

const QUICK_AMOUNTS = [10000, 25000, 50000, 100000];

export function DepositSheet({
  open,
  onClose,
  reserveId,
  walletBalance,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  reserveId: string;
  walletBalance: number;
  onDone: () => void;
}) {
  const { refresh } = useAuth();
  const toast = useToast();
  const [raw, setRaw] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const amount = parseAmount(raw);
  const tooMuch = amount !== null && amount > walletBalance;
  const canSubmit = amount !== null && amount > 0 && !tooMuch && !busy;

  function close() {
    setRaw("");
    setError(null);
    onClose();
  }

  async function submit() {
    if (!canSubmit || amount === null) return;
    setBusy(true);
    setError(null);
    try {
      await getAdapter().deposit(reserveId, amount);
      // El saldo de la billetera lo mueve la RPC: hay que releerlo, no restarlo acá.
      await refresh();
      toast({
        title: `Depositaste ${formatMoney(amount)}`,
        detail: "Ya está disponible en la reserva",
        tone: "positive",
      });
      onDone();
      close();
    } catch (cause) {
      setError(messageFor(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onClose={close} title="Depositar en la reserva">
      <div className="pb-5">
        <AmountInput value={raw} onChange={(next) => { setRaw(next); setError(null); }} autoFocus className="py-4" />

        <p className={`text-center text-xs font-semibold ${tooMuch ? "text-negative" : "text-ink-500"}`}>
          {tooMuch
            ? `Solo tenés ${formatMoney(walletBalance)} en tu billetera`
            : `Disponible en tu billetera: ${formatMoney(walletBalance)}`}
        </p>

        <div className="mt-5 flex gap-2">
          {QUICK_AMOUNTS.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => { setRaw(String(value)); setError(null); }}
              className="flex-1 rounded-xl bg-canvas py-2.5 text-xs font-bold text-ink-700 transition-colors hover:bg-ink-50"
            >
              {formatMoneyShort(value)}
            </button>
          ))}
        </div>

        {error ? (
          <p role="alert" className="mt-4 rounded-xl bg-negative/10 px-3 py-2 text-center text-sm font-semibold text-negative">
            {error}
          </p>
        ) : null}

        <Button fullWidth className="mt-5" disabled={!canSubmit} onClick={() => void submit()}>
          {busy ? <Spinner className="size-5 border-white/40 border-t-white" /> : null}
          Depositar
        </Button>
      </div>
    </Sheet>
  );
}
