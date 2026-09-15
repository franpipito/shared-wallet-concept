import type { Metadata } from "next";
import { DemoStage } from "@/components/screens/demo-stage";

export const metadata: Metadata = {
  title: "Demo · dos celulares",
  description: "Las dos sesiones lado a lado para grabar la demo en una sola toma.",
};

export default function Page() {
  return <DemoStage />;
}
