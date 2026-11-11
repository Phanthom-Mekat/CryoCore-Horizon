import type { Metadata } from "next";
import { AboutView } from "@/components/chattogram/views/AboutView";

// the case loads in the browser (see layout.tsx), so this page is not expected to render instantly
export const instant = false;
export const metadata: Metadata = { title: "About" };
export default function Page() {
  return <AboutView />;
}
