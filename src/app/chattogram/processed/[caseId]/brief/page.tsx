import { notFound } from "next/navigation";
import { ProcessedBrief } from "@/components/chattogram/ProcessedBrief";

export const instant = false;
export const metadata = { title: "Measured observation brief" };

export default async function Page({ params }: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await params;
  if (!/^[a-f0-9]{24}$/.test(caseId)) notFound();
  return <ProcessedBrief key={caseId} caseId={caseId} />;
}
