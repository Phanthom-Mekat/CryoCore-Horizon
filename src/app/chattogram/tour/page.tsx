import type { Metadata } from "next";
import { TourView } from "@/components/chattogram/views/TourView";

// the case loads in the browser (see layout.tsx), so this page is not expected to render instantly
export const instant = false;
export const metadata: Metadata = { title: "Guided tour" };
export default function Page() {
  return <TourView />;
}
