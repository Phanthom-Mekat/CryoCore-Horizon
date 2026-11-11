import type { Metadata } from "next";
import { Suspense } from "react";
import { PassesView } from "@/components/dashboard/views/PassesView";

export const metadata: Metadata = { title: "NISAR passes" };
// useSearchParams (the ?q= search) needs a Suspense boundary on a static route
export default function Page() {
  return (
    <Suspense>
      <PassesView />
    </Suspense>
  );
}
