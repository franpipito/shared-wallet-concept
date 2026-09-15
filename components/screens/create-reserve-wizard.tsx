"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Check, Plus, UserPlus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Spinner } from "@/components/ui/loader";
import { ConceptFooter, Screen, ScreenHeader } from "@/components/ui/screen";
import { getAdapter } from "@/lib/data";
import { messageFor } from "@/lib/errors";
import { formatMoney, parseAmount } from "@/lib/format";
import type { PublicProfile } from "@/lib/types";

const EMOJIS = ["🏔️", "🏖️", "✈️", "🎉", "🏠", "🚗", "🎁", "🍽️", "🎸", "⚽"];

const STEPS = ["Nombre", "Meta", "Invitar"] as const;

export function CreateReserveWizard() {
  const router = useRouter();
  const [step, setStep] = useState(0);

  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("🏔️");
  const [goalRaw, setGoalRaw] = useState("");
  const [startsAt, setStartsAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [endsAt, setEndsAt] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().slice(0, 10);
  });
  const [invitees, setInvitees] = useState<PublicProfile[]>([]);

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const goal = parseAmount(goalRaw);
  const canContinue =
    step === 0 ? name.trim().length >= 2 : step === 1 ? !!goal && goal > 0 && endsAt >= startsAt : true;

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const adapter = getAdapter();
      const reserveId = await adapter.createReserve({
        name: name.trim(),
        emoji,
        goalAmount: goal!,
        startsAt,
        endsAt,
      });

      // Las invitaciones se mandan de a una: si un alias falla, la reserva ya
      // existe y no se pierde lo cargado.
      for (const invitee of invitees) {
        await adapter.inviteMember(reserveId, invitee.alias, null);
      }

      router.replace(`/reservas/${reserveId}`);
    } catch (cause) {
      setError(messageFor(cause));
      setBusy(false);
    }
  }

  return (
    <Screen>
      <ScreenHeader
        title="Nueva reserva"
        subtitle={`Paso ${step + 1} de 3 · ${STEPS[step]}`}
        onBack={() => (step === 0 ? router.back() : setStep(step - 1))}
      />

      <div className="flex gap-1.5 px-4 pb-5">
        {STEPS.map((label, index) => (
          <div
            key={label}
            className={`h-1.5 flex-1 rounded-full transition-colors ${
              index <= step ? "bg-brand-500" : "bg-ink-100"
            }`}
          />
        ))}
      </div>

      <main className="flex-1 px-4">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            transition={{ duration: 0.22 }}
          >
            {step === 0 ? (
              <StepName
                name={name}
                setName={setName}
                emoji={emoji}
                setEmoji={setEmoji}
              />
            ) : null}
            {step === 1 ? (
              <StepGoal
                goalRaw={goalRaw}
                setGoalRaw={setGoalRaw}
                goal={goal}
                startsAt={startsAt}
                setStartsAt={setStartsAt}
                endsAt={endsAt}
                setEndsAt={setEndsAt}
              />
            ) : null}
            {step === 2 ? (
              <StepInvite invitees={invitees} setInvitees={setInvitees} />
            ) : null}
          </motion.div>
        </AnimatePresence>

        {error ? (
          <p role="alert" className="mt-4 rounded-xl bg-negative/10 px-3 py-2 text-sm font-semibold text-negative">
            {error}
          </p>
        ) : null}
      </main>

      <div className="px-4 pb-4 pt-6">
        <Button
          fullWidth
          disabled={!canContinue || busy}
          onClick={() => (step < 2 ? setStep(step + 1) : void create())}
        >
          {busy ? <Spinner className="size-5 border-white/40 border-t-white" /> : null}
          {step < 2 ? "Continuar" : "Crear reserva"}
        </Button>
      </div>

      <ConceptFooter className="pt-0" />
    </Screen>
  );
}

function StepName({
  name,
  setName,
  emoji,
  setEmoji,
}: {
  name: string;
  setName: (v: string) => void;
  emoji: string;
  setEmoji: (v: string) => void;
}) {
  return (
    <div>
      <h2 className="text-xl font-extrabold text-ink-900">¿Para qué es la reserva?</h2>
      <p className="mt-1 text-sm text-ink-500">Ponele un nombre que reconozcan todos.</p>

      <Card className="mt-5">
        <div className="flex items-center gap-3">
          <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-brand-50 text-3xl">
            {emoji}
          </span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={60}
            autoFocus
            placeholder="Viaje a Bariloche"
            aria-label="Nombre de la reserva"
            className="w-full border-none bg-transparent text-lg font-extrabold text-ink-900 outline-none placeholder:font-bold placeholder:text-ink-300"
          />
        </div>

        <div className="mt-4 flex flex-wrap gap-2 border-t border-ink-50 pt-4">
          {EMOJIS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setEmoji(option)}
              aria-label={`Elegir ${option}`}
              aria-pressed={emoji === option}
              className={`grid size-11 place-items-center rounded-xl text-xl transition-colors ${
                emoji === option ? "bg-brand-500/15 ring-2 ring-brand-500" : "bg-canvas hover:bg-ink-50"
              }`}
            >
              {option}
            </button>
          ))}
        </div>
      </Card>
    </div>
  );
}

function StepGoal({
  goalRaw,
  setGoalRaw,
  goal,
  startsAt,
  setStartsAt,
  endsAt,
  setEndsAt,
}: {
  goalRaw: string;
  setGoalRaw: (v: string) => void;
  goal: number | null;
  startsAt: string;
  setStartsAt: (v: string) => void;
  endsAt: string;
  setEndsAt: (v: string) => void;
}) {
  return (
    <div>
      <h2 className="text-xl font-extrabold text-ink-900">¿Cuánto quieren juntar?</h2>
      <p className="mt-1 text-sm text-ink-500">Es una meta orientativa, la podés superar.</p>

      <Card className="mt-5">
        <label className="block">
          <span className="text-xs font-bold text-ink-700">Meta</span>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-2xl font-bold text-ink-300">$</span>
            <input
              value={goalRaw}
              onChange={(event) => setGoalRaw(event.target.value)}
              inputMode="decimal"
              autoFocus
              placeholder="600.000"
              aria-label="Meta de la reserva"
              className="tabular w-full border-none bg-transparent text-3xl font-extrabold text-ink-900 outline-none placeholder:text-ink-300"
            />
          </div>
          {goal ? (
            <span className="mt-1 block text-xs font-semibold text-ink-500">{formatMoney(goal)}</span>
          ) : null}
        </label>
      </Card>

      <Card className="mt-3">
        <p className="mb-3 text-xs font-bold text-ink-700">Fechas del viaje</p>
        <div className="flex gap-3">
          <DateField label="Desde" value={startsAt} onChange={setStartsAt} />
          <DateField label="Hasta" value={endsAt} onChange={setEndsAt} min={startsAt} />
        </div>
        {endsAt < startsAt ? (
          <p className="mt-2 text-xs font-semibold text-negative">
            La fecha de fin no puede ser anterior al inicio.
          </p>
        ) : null}
      </Card>
    </div>
  );
}

function DateField({
  label,
  value,
  onChange,
  min,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  min?: string;
}) {
  return (
    <label className="flex-1">
      <span className="mb-1 block text-[11px] font-bold text-ink-500">{label}</span>
      <input
        type="date"
        value={value}
        min={min}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-ink-100 bg-canvas px-3 py-2.5 text-sm font-semibold text-ink-900 outline-none focus:border-brand-400"
      />
    </label>
  );
}

function StepInvite({
  invitees,
  setInvitees,
}: {
  invitees: PublicProfile[];
  setInvitees: (v: PublicProfile[]) => void;
}) {
  const [alias, setAlias] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function add() {
    const clean = alias.trim().toLowerCase();
    if (!clean) return;
    if (invitees.some((i) => i.alias === clean)) {
      setError("Ya lo agregaste a la lista.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      // Se resuelve el alias ANTES de crear la reserva para no llegar al final
      // del wizard y descubrir recién ahí que estaba mal escrito.
      const found = await getAdapter().findProfileByAlias(clean);
      if (!found) {
        setError("No encontramos a nadie con ese alias.");
      } else {
        setInvitees([...invitees, found]);
        setAlias("");
      }
    } catch (cause) {
      setError(messageFor(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h2 className="text-xl font-extrabold text-ink-900">¿Con quién la compartís?</h2>
      <p className="mt-1 text-sm text-ink-500">
        Invitá por alias. Pueden sumarse después también.
      </p>

      <Card className="mt-5">
        <div className="flex gap-2">
          <input
            value={alias}
            onChange={(event) => {
              setAlias(event.target.value.toLowerCase().replace(/[^a-z0-9.]/g, ""));
              setError(null);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void add();
              }
            }}
            placeholder="sofi.viaje.mp"
            aria-label="Alias a invitar"
            className="w-full rounded-xl border border-ink-100 bg-canvas px-3.5 py-3 text-[15px] outline-none placeholder:text-ink-300 focus:border-brand-400"
          />
          <Button
            onClick={() => void add()}
            disabled={busy || !alias.trim()}
            aria-label="Agregar"
            className="min-w-12 px-0"
          >
            {busy ? <Spinner className="size-5 border-white/40 border-t-white" /> : <Plus className="size-5" />}
          </Button>
        </div>

        {error ? (
          <p role="alert" className="mt-2 text-xs font-semibold text-negative">
            {error}
          </p>
        ) : null}

        {invitees.length > 0 ? (
          <ul className="mt-4 flex flex-col gap-2 border-t border-ink-50 pt-4">
            <AnimatePresence initial={false}>
              {invitees.map((invitee) => (
                <motion.li
                  key={invitee.id}
                  layout
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 12 }}
                  className="flex items-center gap-3"
                >
                  <Avatar name={invitee.name} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-ink-900">{invitee.name}</p>
                    <p className="truncate text-[11px] text-ink-500">{invitee.alias}</p>
                  </div>
                  <button
                    type="button"
                    aria-label={`Quitar a ${invitee.name}`}
                    onClick={() => setInvitees(invitees.filter((i) => i.id !== invitee.id))}
                    className="grid size-8 place-items-center rounded-full text-ink-300 transition-colors hover:bg-ink-50 hover:text-ink-700"
                  >
                    <X className="size-4" />
                  </button>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        ) : (
          <div className="mt-4 flex items-center gap-2.5 border-t border-ink-50 pt-4 text-ink-300">
            <UserPlus className="size-4" />
            <p className="text-xs">Todavía no invitaste a nadie</p>
          </div>
        )}
      </Card>

      {invitees.length > 0 ? (
        <p className="mt-3 flex items-center gap-1.5 px-1 text-xs text-ink-500">
          <Check className="size-3.5 text-positive" />
          Les va a llegar la invitación al crear la reserva.
        </p>
      ) : null}
    </div>
  );
}
