import type { Metadata } from "next";
import { Explorer } from "@/components/explorer/Explorer";
import "maplibre-gl/dist/maplibre-gl.css";
import "./explore.css";

export const metadata: Metadata = {
  title: "Chattogram observation atlas | CryoCore Horizon",
  description: "Explore real NASA–ISRO NISAR catalog footprints across Chattogram Division, Bangladesh, with acquisition dates and source evidence.",
};

export default function ExplorePage() {
  return <Explorer />;
}
