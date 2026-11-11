import type { Metadata } from "next";
import { EvidenceView } from "@/components/chattogram/views/EvidenceView";

// the case loads in the browser (see layout.tsx), so this page is not expected to render instantly
export const instant = false;
export const metadata: Metadata = { title: "Evidence" };
export default function Page() {
  return <EvidenceView />;
}
