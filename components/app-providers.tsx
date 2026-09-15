"use client";

import { AuthProvider } from "@/components/auth-provider";
import { ServiceWorker } from "@/components/service-worker";
import { SlotUrlSync } from "@/components/slot-url-sync";
import { ToastProvider } from "@/components/toast-provider";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <ToastProvider>
        <SlotUrlSync />
        {children}
        <ServiceWorker />
      </ToastProvider>
    </AuthProvider>
  );
}
