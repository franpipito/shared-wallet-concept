"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { messageFor } from "@/lib/errors";

interface LoaderState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

/**
 * Carga asíncrona con recarga manual. El realtime llama a `reload()` cuando
 * llega un cambio, así la pantalla siempre vuelve a leer los montos del
 * servidor en lugar de recalcularlos en el cliente.
 */
export function useLoader<T>(load: () => Promise<T>, deps: React.DependencyList) {
  // Guardamos la función en un ref para que redefinirla en cada render no
  // dispare la recarga: las dependencias reales son `deps`.
  const loadRef = useRef(load);
  loadRef.current = load;

  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const [state, setState] = useState<LoaderState<T>>({
    data: null,
    loading: true,
    error: null,
  });

  const reload = useCallback(async () => {
    try {
      const data = await loadRef.current();
      if (aliveRef.current) setState({ data, loading: false, error: null });
    } catch (cause) {
      if (aliveRef.current) {
        setState((prev) => ({ data: prev.data, loading: false, error: messageFor(cause) }));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { ...state, reload };
}
