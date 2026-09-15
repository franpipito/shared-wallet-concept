"use client";

import { motion } from "framer-motion";
import { useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { Button } from "@/components/ui/button";
import { ConceptFooter, Screen } from "@/components/ui/screen";
import { Spinner } from "@/components/ui/loader";
import { isDemoMode, isMockMode } from "@/lib/data";
import { DEMO_PASSWORD, DEMO_USERS } from "@/lib/demo-data";
import { messageFor } from "@/lib/errors";

type Mode = "signin" | "signup";

export function LoginScreen() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [alias, setAlias] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (cause) {
      setError(messageFor(cause));
    } finally {
      setBusy(false);
    }
  }

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    void run(async () => {
      if (mode === "signin") {
        await signIn(email, password);
      } else {
        await signUp({ email, password, name, alias });
      }
    });
  };

  return (
    <Screen className="bg-surface">
      <div className="flex flex-1 flex-col justify-center px-6 py-10">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
        >
          <div className="mb-8">
            <div className="mb-4 grid size-14 place-items-center rounded-2xl bg-brand-500 text-2xl">
              💳
            </div>
            <h1 className="text-2xl font-extrabold text-ink-900">Billetera</h1>
            <p className="mt-1 text-sm text-ink-500">
              {mode === "signin"
                ? "Entrá para ver tus reservas compartidas."
                : "Creá tu cuenta para empezar a compartir reservas."}
            </p>
          </div>

          <form onSubmit={onSubmit} className="flex flex-col gap-3">
            {mode === "signup" ? (
              <>
                <Field
                  label="Nombre"
                  value={name}
                  onChange={setName}
                  placeholder="Juan Pereyra"
                  autoComplete="name"
                  required
                />
                <Field
                  label="Alias"
                  value={alias}
                  onChange={(v) => setAlias(v.toLowerCase().replace(/[^a-z0-9.]/g, ""))}
                  placeholder="juan.viaje.mp"
                  hint="Con esto te invitan a las reservas."
                  required
                />
              </>
            ) : null}

            <Field
              label="Email"
              type="email"
              value={email}
              onChange={setEmail}
              placeholder="vos@email.com"
              autoComplete="email"
              required
            />
            <Field
              label="Contraseña"
              type="password"
              value={password}
              onChange={setPassword}
              placeholder="••••••••"
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              required
            />

            {error ? (
              <p role="alert" className="rounded-xl bg-negative/10 px-3 py-2 text-sm font-semibold text-negative">
                {error}
              </p>
            ) : null}

            <Button type="submit" fullWidth disabled={busy} className="mt-2">
              {busy ? <Spinner className="size-5 border-white/40 border-t-white" /> : null}
              {mode === "signin" ? "Entrar" : "Crear cuenta"}
            </Button>
          </form>

          <button
            type="button"
            onClick={() => {
              setMode(mode === "signin" ? "signup" : "signin");
              setError(null);
            }}
            className="mt-4 w-full text-center text-sm font-semibold text-brand-600"
          >
            {mode === "signin" ? "No tengo cuenta" : "Ya tengo cuenta"}
          </button>

          {isDemoMode() ? (
            <div className="mt-8 rounded-card border border-dashed border-ink-100 p-4">
              <p className="mb-3 text-xs font-bold uppercase tracking-wide text-ink-300">
                Entrar como demo
              </p>
              <div className="flex gap-2">
                {DEMO_USERS.map((user) => (
                  <Button
                    key={user.key}
                    variant="secondary"
                    fullWidth
                    disabled={busy}
                    onClick={() => void run(() => signIn(user.email, DEMO_PASSWORD))}
                  >
                    {user.name.split(" ")[0]}
                  </Button>
                ))}
              </div>
              <p className="mt-3 text-[11px] leading-relaxed text-ink-300">
                {isMockMode()
                  ? "Modo local: los datos viven en este navegador, sin backend."
                  : "Usuarios creados por el script de seed."}
              </p>
            </div>
          ) : null}
        </motion.div>
      </div>

      <ConceptFooter />
    </Screen>
  );
}

function Field({
  label,
  value,
  onChange,
  hint,
  ...props
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value">) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-bold text-ink-700">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-ink-100 bg-canvas px-3.5 py-3 text-[15px] text-ink-900 outline-none transition-colors placeholder:text-ink-300 focus:border-brand-400 focus:bg-surface"
        {...props}
      />
      {hint ? <span className="mt-1 block text-[11px] text-ink-300">{hint}</span> : null}
    </label>
  );
}
