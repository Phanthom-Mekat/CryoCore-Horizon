import type { Metadata } from "next";
import type { ReactNode } from "react";
import { DashboardProvider } from "@/components/dashboard/DashboardProvider";
import { Shell } from "@/components/dashboard/Shell";
import "./dashboard.css";

// The glacier data is read in the browser from public/data (so new pipeline output shows up without a rebuild),
// which means navigating into the dashboard may wait on it. The shell still renders straight away.
export const instant = false;

export const metadata: Metadata = {
  title: { template: "%s | Jakobshavn ice dashboard", default: "Jakobshavn ice dashboard" },
  description: "Ice speed, calving front position and radar images of Jakobshavn Glacier from NISAR.",
};

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <DashboardProvider>
      <Shell>{children}</Shell>
    </DashboardProvider>
  );
}
