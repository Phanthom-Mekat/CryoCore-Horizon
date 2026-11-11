import type { Metadata } from "next";
import { OverviewView } from "@/components/chattogram/views/OverviewView";

// the case loads in the browser (see layout.tsx), so this page is not expected to render instantly
export const instant = false;
export const metadata: Metadata = { title: "Overview" };
export default function Page() {
  return <OverviewView />;
}
