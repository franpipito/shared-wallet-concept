"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { getAdapter, isDemoMode } from "@/lib/data";
import { DEMO_PASSWORD, DEMO_USERS } from "@/lib/demo-data";
import type { Profile } from "@/lib/types";

interface AuthValue {
  profile: Profile | null;
  loading: boolean;
  refresh: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (input: { email: string; password: string; name: string; alias: string }) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth debe usarse dentro de <AuthProvider>");
  return value;
}

/**
 * La sesión inicial se resuelve una sola vez por carga de página y se comparte
 * como promesa. En StrictMode el efecto se monta dos veces: si en lugar de
 * esto usáramos un flag "ya arranqué", el segundo pase saldría temprano, el
 * primero ya estaría marcado como inactivo y la pantalla quedaría colgada en
 * el loader. Compartir la promesa además evita que /demo dispare dos signIn.
 */
let bootstrapPromise: Promise<Profile | null> | null = null;

async function resolveInitialProfile(): Promise<Profile | null> {
  const adapter = getAdapter();
  const current = await adapter.getCurrentProfile();
  if (current) return current;

  // /demo abre cada "celular" con ?as=juan|sofi para entrar sin tipear.
  if (!isDemoMode()) return null;
  const who = new URLSearchParams(window.location.search).get("as");
  const demoUser = DEMO_USERS.find((u) => u.key === who);
  if (!demoUser) return null;

  try {
    return await adapter.signIn(demoUser.email, DEMO_PASSWORD);
  } catch {
    // Sin datos sembrados todavía: cae en la pantalla de login normal.
    return null;
  }
}

function bootstrap(): Promise<Profile | null> {
  bootstrapPromise ??= resolveInitialProfile();
  return bootstrapPromise;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setProfile(await getAdapter().getCurrentProfile());
  }, []);

  useEffect(() => {
    let active = true;

    void bootstrap().then((initial) => {
      if (!active) return;
      setProfile(initial);
      setLoading(false);
    });

    const unsubscribe = getAdapter().onAuthChange((next) => {
      if (active) setProfile(next);
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const value: AuthValue = {
    profile,
    loading,
    refresh,
    signIn: async (email, password) => {
      const next = await getAdapter().signIn(email, password);
      bootstrapPromise = Promise.resolve(next);
      setProfile(next);
    },
    signUp: async (input) => {
      const next = await getAdapter().signUp(input);
      bootstrapPromise = Promise.resolve(next);
      setProfile(next);
    },
    signOut: async () => {
      await getAdapter().signOut();
      bootstrapPromise = Promise.resolve(null);
      setProfile(null);
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
