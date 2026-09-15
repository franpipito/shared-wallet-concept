"use client";

import { RotateCcw, Smartphone } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { isMockMode } from "@/lib/data";
import { resetMockDb } from "@/lib/data/mock-adapter";
import { DEMO_USERS } from "@/lib/demo-data";

/** Medidas reales del "teléfono": pantalla 390×844 más el marco. */
const SCREEN_W = 390;
const SCREEN_H = 844;
const FRAME = 12;
const FRAME_W = SCREEN_W + FRAME * 2;
const FRAME_H = SCREEN_H + FRAME * 2;

/**
 * Los dos "celulares" lado a lado para grabar el video en una sola toma.
 *
 * Cada iframe apunta a la misma app con un slot de sesión distinto (?s=a / ?s=b).
 * Dos iframes del mismo origen comparten localStorage, así que sin el slot
 * ambos estarían logueados con el MISMO usuario; con él, cada uno guarda su
 * sesión bajo su propia clave y Juan y Sofi conviven en una sola pestaña.
 */
export function DemoStage() {
  const [nonce, setNonce] = useState(0);

  // Dos teléfonos a tamaño real no entran en una pantalla de 1080p junto con el
  // encabezado, y habría que scrollear justo mientras se graba. Se escalan para
  // que la toma entre completa.
  //
  // El espacio disponible se MIDE en lugar de estimarse: el contenedor es
  // flex-1 con min-h-0, así que su alto lo fija el layout y no los teléfonos
  // (no hay realimentación). Una constante a ojo se quedaba corta por unos
  // píxeles y la página seguía scrolleando.
  const stageRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.8);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const CAPTION_H = 52; // epígrafe con el nombre + separación

    const fit = () => {
      const { clientHeight, clientWidth } = stage;
      if (clientHeight === 0 || clientWidth === 0) return;

      const sideBySide = window.innerWidth >= 1024;
      const byHeight = (clientHeight - CAPTION_H) / FRAME_H;
      const byWidth = sideBySide
        ? (clientWidth - 32) / (FRAME_W * 2)
        : clientWidth / FRAME_W;

      setScale(Math.max(0.4, Math.min(1, byHeight, byWidth)));
    };

    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  const restart = useCallback(() => {
    // Solo aplica en modo mock: con Supabase los datos están en el servidor y
    // se rehacen corriendo `npm run seed`.
    if (isMockMode()) resetMockDb();
    reload();
  }, [reload]);

  // Alto FIJO, no min-h: con min-h el contenedor crece con los teléfonos y la
  // medición del espacio disponible nunca se achica.
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-[#0d1b26] text-white">
      <header className="mx-auto flex w-full max-w-5xl shrink-0 flex-col gap-3 px-6 pb-4 pt-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-300">
            Reserva compartida
          </p>
          <h1 className="mt-1 text-2xl font-extrabold leading-tight">
            Dos personas, una reserva, en tiempo real
          </h1>
          <p className="mt-1 max-w-xl text-xs leading-relaxed text-white/55">
            Pagá desde un celular y mirá cómo aparece el movimiento en el otro, sin recargar.
            Cada teléfono tiene su propia sesión.
          </p>
        </div>

        <div className="flex shrink-0 gap-2">
          <HeaderButton icon={Smartphone} label="Recargar" onClick={reload} />
          <HeaderButton icon={RotateCcw} label="Reiniciar demo" onClick={restart} />
        </div>
      </header>

      <div
        ref={stageRef}
        className="flex min-h-0 flex-1 flex-col items-center justify-start gap-6 overflow-hidden px-6 pb-4 lg:flex-row lg:items-start lg:justify-center lg:gap-8"
      >
        {DEMO_USERS.map((user, index) => (
          <Phone
            key={user.key}
            label={user.name}
            caption={user.alias}
            // El slot va en la URL del iframe: es lo que aísla las sesiones.
            src={`/?s=${index === 0 ? "a" : "b"}&as=${user.key}`}
            nonce={nonce}
            scale={scale}
          />
        ))}
      </div>

      <p className="shrink-0 pb-4 text-center text-[11px] text-white/35">
        Concepto no oficial · Prototipo con fines demostrativos · El saldo es simulado
      </p>
    </div>
  );
}

function HeaderButton({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof Smartphone;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2 rounded-xl bg-white/10 px-3.5 py-2.5 text-xs font-bold transition-colors hover:bg-white/15"
    >
      <Icon className="size-4" />
      {label}
    </button>
  );
}

function Phone({
  label,
  caption,
  src,
  nonce,
  scale,
}: {
  label: string;
  caption: string;
  src: string;
  nonce: number;
  scale: number;
}) {
  return (
    <figure className="flex flex-col items-center gap-2.5">
      {/* El transform no ocupa espacio en el layout, así que el contenedor lleva
          las medidas ya escaladas para que el resto de la página no salte. */}
      <div style={{ width: FRAME_W * scale, height: FRAME_H * scale }}>
        <div
          style={{
            width: FRAME_W,
            height: FRAME_H,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
          }}
          className="rounded-[44px] bg-[#1e2d3a] p-3 shadow-[0_24px_60px_rgba(0,0,0,0.45)]"
        >
          <div
            className="overflow-hidden rounded-[32px] bg-canvas"
            style={{ width: SCREEN_W, height: SCREEN_H }}
          >
            <iframe
              key={nonce}
              src={src}
              title={`Celular de ${label}`}
              className="size-full border-0"
              sandbox="allow-scripts allow-same-origin allow-forms"
            />
          </div>
        </div>
      </div>

      <figcaption className="text-center">
        <p className="text-sm font-extrabold">{label}</p>
        <p className="text-xs text-white/45">{caption}</p>
      </figcaption>
    </figure>
  );
}
