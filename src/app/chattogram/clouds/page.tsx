import type { Metadata } from "next";
import { CloudsView } from "@/components/chattogram/views/CloudsView";
import "../myarea.css";

export const instant = false;
export const metadata: Metadata = { title: "Through the clouds" };
export default function Page() {
  return <CloudsView />;
}
