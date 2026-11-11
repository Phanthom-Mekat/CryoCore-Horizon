import type { Metadata } from "next";
import { Suspense, type ReactNode } from "react";
import { CaseProvider } from "@/components/chattogram/CaseProvider";
import { CaseShell } from "@/components/chattogram/CaseShell";
import "maplibre-gl/dist/maplibre-gl.css";
import "../dashboard/dashboard.css";
import "./chattogram.css";

// The case is read in the browser from the backend API, so navigating in may wait on it.
export const instant = false;

export const metadata: Metadata = {
  title: { template: "%s | Chattogram NISAR case", default: "Chattogram NISAR case" },
  description: "NASA–ISRO NISAR radar acquisitions over Chattogram, Bangladesh: explore, compare and inspect the evidence.",
};

export default function CaseLayout({ children }: { children: ReactNode }) {
  return (
    // the selection lives in the URL (useSearchParams), which needs a Suspense boundary on a static route
    <Suspense>
      <CaseProvider>
        <CaseShell>{children}</CaseShell>
      </CaseProvider>
    </Suspense>
  );
}
