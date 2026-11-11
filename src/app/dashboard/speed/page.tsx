import type { Metadata } from "next";
import { SpeedView } from "@/components/dashboard/views/SpeedView";

export const metadata: Metadata = { title: "Ice speed" };
export default function Page() {
  return <SpeedView />;
}
