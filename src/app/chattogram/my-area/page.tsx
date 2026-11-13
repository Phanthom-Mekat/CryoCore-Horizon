import type { Metadata } from "next";
import { MyAreaView } from "@/components/chattogram/views/MyAreaView";
import "../myarea.css";

export const instant = false;
export const metadata: Metadata = { title: "My area" };
export default function Page() {
  return <MyAreaView />;
}
