import type { Metadata } from "next";
import { RadarView } from "@/components/dashboard/views/RadarView";

// data loads in the browser (see ../layout.tsx), so this page is not expected to render instantly
export const instant = false;
export const metadata: Metadata = { title: "Radar images" };
export default function Page() {
  return <RadarView />;
}
