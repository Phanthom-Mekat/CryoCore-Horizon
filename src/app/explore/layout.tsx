import type { ReactNode } from "react";
import { Shell } from "@/components/dashboard/Shell";
import "../dashboard/dashboard.css";

export default function ExplorerLayout({ children }: { children: ReactNode }) {
  return <Shell>{children}</Shell>;
}
