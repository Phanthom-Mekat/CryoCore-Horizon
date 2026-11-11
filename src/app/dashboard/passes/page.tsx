import type { Metadata } from "next";
import { Suspense } from "react";
import { PassesView } from "@/components/dashboard/views/PassesView";

// data loads in the browser (see ../layout.tsx), so this page is not expected to render instantly
export const instant = false;
export const metadata: Metadata = { title: "NISAR passes" };
// useSearchParams (the ?q= search) needs a Suspense boundary on a static route
export default function Page() {
  return (
    <Suspense>
      <PassesView />
    </Suspense>
  );
}
