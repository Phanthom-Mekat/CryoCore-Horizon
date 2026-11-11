import type { Metadata } from "next";
import { RadarView } from "@/components/dashboard/views/RadarView";

export const metadata: Metadata = { title: "Radar images" };
export default function Page() {
  return <RadarView />;
}
