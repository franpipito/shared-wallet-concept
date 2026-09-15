"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/components/auth-provider";
import { LoginScreen } from "@/components/screens/login-screen";
import { FullScreenLoader } from "@/components/ui/loader";

export default function Page() {
  const { profile, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && profile) router.replace("/");
  }, [loading, profile, router]);

  if (loading || profile) return <FullScreenLoader />;
  return <LoginScreen />;
}
