import type { Metadata } from "next";
import { AlertsView } from "@/components/dashboard/views/AlertsView";

export const metadata: Metadata = { title: "Alerts" };
export default function Page() {
  return <AlertsView />;
}
