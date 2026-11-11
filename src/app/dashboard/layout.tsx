import type { Metadata } from "next";
import type { ReactNode } from "react";
import { DashboardProvider } from "@/components/dashboard/DashboardProvider";
import { Shell } from "@/components/dashboard/Shell";
import "./dashboard.css";

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
