import type { Metadata } from "next";
import { TimelapseView } from "@/components/chattogram/views/TimelapseView";
import "../myarea.css";

export const instant = false;
export const metadata: Metadata = { title: "Monsoon time-lapse" };
export default function Page() {
  return <TimelapseView />;
}
