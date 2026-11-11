import type { Metadata } from "next";
import { FrontsView } from "@/components/dashboard/views/FrontsView";

// data loads in the browser (see ../layout.tsx), so this page is not expected to render instantly
export const instant = false;
export const metadata: Metadata = { title: "Calving front" };
export default function Page() {
  return <FrontsView />;
}
