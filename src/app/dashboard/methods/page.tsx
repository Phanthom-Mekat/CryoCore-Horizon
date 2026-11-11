import type { Metadata } from "next";
import { MethodsView } from "@/components/dashboard/views/MethodsView";

// data loads in the browser (see ../layout.tsx), so this page is not expected to render instantly
export const instant = false;
export const metadata: Metadata = { title: "Data and methods" };
export default function Page() {
  return <MethodsView />;
}
