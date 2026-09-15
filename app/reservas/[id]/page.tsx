"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/components/auth-provider";
import { ReserveDetailScreen } from "@/components/screens/reserve-detail-screen";
import { FullScreenLoader } from "@/components/ui/loader";

export default function Page() {
  const { profile, loading } = useAuth();
  const router = useRouter();
  const params = useParams<{ id: string }>();

  useEffect(() => {
    if (!loading && !profile) router.replace("/login");
  }, [loading, profile, router]);

  if (loading || !profile) return <FullScreenLoader />;
  return <ReserveDetailScreen reserveId={params.id} profile={profile} />;
}
