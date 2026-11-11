import type { Metadata } from "next";
import { SpeedView } from "@/components/dashboard/views/SpeedView";

// data loads in the browser (see ../layout.tsx), so this page is not expected to render instantly
export const instant = false;
export const metadata: Metadata = { title: "Ice speed" };
export default function Page() {
  return <SpeedView />;
}
