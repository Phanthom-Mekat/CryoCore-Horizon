import { notFound } from "next/navigation";
import { ProcessedBrief } from "@/components/chattogram/ProcessedBrief";
import { parseRadarState } from "@/lib/chattogram/processed-state";

export const instant = false;
export const metadata = { title: "Measured observation brief" };

export default async function Page({ params, searchParams }: { params: Promise<{ caseId: string }>; searchParams: Promise<{ ra?: string | string[] }> }) {
  const { caseId } = await params;
  if (!/^[a-f0-9]{24}$/.test(caseId)) notFound();
  const { ra } = await searchParams;
  // the area measured on the Calibrated radar page, validated like a share link's (parseRadarState)
  const area = parseRadarState(new URLSearchParams(typeof ra === "string" ? { ra } : {})).area;
  return <ProcessedBrief key={`${caseId}/${ra}`} caseId={caseId} area={area} />;
}
