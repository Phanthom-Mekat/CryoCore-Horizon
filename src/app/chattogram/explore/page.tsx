import type { Metadata } from "next";
import { ExploreView } from "@/components/chattogram/views/ExploreView";

// the case loads in the browser (see layout.tsx), so this page is not expected to render instantly
export const instant = false;
export const metadata: Metadata = { title: "Explore map" };
export default function Page() {
  return <ExploreView />;
}
