import type { Metadata } from "next";
import { AlertsView } from "@/components/dashboard/views/AlertsView";

// data loads in the browser (see ../layout.tsx), so this page is not expected to render instantly
export const instant = false;
export const metadata: Metadata = { title: "Alerts" };
export default function Page() {
  return <AlertsView />;
}
