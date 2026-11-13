import type { Metadata } from "next";
import { Suspense, type ReactNode } from "react";
import { Shell } from "@/components/dashboard/Shell";
import { CaseProvider } from "@/components/chattogram/CaseProvider";
import { CaseGate } from "@/components/chattogram/CaseGate";
import { Assistant } from "@/components/chattogram/Assistant";
import "mapbox-gl/dist/mapbox-gl.css";
import "./dashboard.css";
import "./chattogram.css";

// The case is read in the browser through the backend proxy, so navigating in may wait on it.
export const instant = false;

export const metadata: Metadata = {
  title: { template: "%s | Chattogram NISAR case", default: "Chattogram NISAR case" },
  description: "NASA–ISRO NISAR radar over Chattogram, Bangladesh: explore the acquisitions, compare dates and inspect the evidence.",
};

export default function CaseLayout({ children }: { children: ReactNode }) {
  return (
    <Shell>
      {/* the selection lives in the URL (useSearchParams), which needs a Suspense boundary on a static route */}
      <Suspense>
        <CaseProvider>
          <CaseGate>{children}</CaseGate>
          <Assistant />
        </CaseProvider>
      </Suspense>
    </Shell>
  );
}
