import type { Metadata } from "next";
import { MethodsView } from "@/components/dashboard/views/MethodsView";

export const metadata: Metadata = { title: "Data and methods" };
export default function Page() {
  return <MethodsView />;
}
