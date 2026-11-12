import type { Metadata } from "next";
import { ProcessedView } from "@/components/chattogram/views/ProcessedView";
export const instant = false;
export const metadata: Metadata = { title: "Calibrated radar" };
export default function Page() { return <ProcessedView />; }
