import type { Metadata } from "next";
import { CompareView } from "@/components/chattogram/views/CompareView";

// the case loads in the browser (see layout.tsx), so this page is not expected to render instantly
export const instant = false;
export const metadata: Metadata = { title: "Compare" };
export default function Page() {
  return <CompareView />;
}
