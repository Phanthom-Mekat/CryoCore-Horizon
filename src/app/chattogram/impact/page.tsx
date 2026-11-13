import type { Metadata } from "next";
import { ImpactView } from "@/components/chattogram/views/ImpactView";
import "../impact.css";

export const instant = false;
export const metadata: Metadata = { title: "Impact and priorities" };
export default function Page() {
  return <ImpactView />;
}
