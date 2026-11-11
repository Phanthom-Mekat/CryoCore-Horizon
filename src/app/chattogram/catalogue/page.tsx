import type { Metadata } from "next";
import { Explorer } from "@/components/explorer/Explorer";
import "./catalogue.css";

// the catalogue loads in the browser (see ../layout.tsx), so this page is not expected to render instantly
export const instant = false;
export const metadata: Metadata = {
  title: "Scene catalogue",
  description: "Every stored NASA–ISRO NISAR scene across Chattogram Division, Bangladesh, with acquisition dates and source evidence.",
};

export default function Page() {
  return <Explorer />;
}
