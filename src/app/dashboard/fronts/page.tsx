import type { Metadata } from "next";
import { FrontsView } from "@/components/dashboard/views/FrontsView";

export const metadata: Metadata = { title: "Calving front" };
export default function Page() {
  return <FrontsView />;
}
