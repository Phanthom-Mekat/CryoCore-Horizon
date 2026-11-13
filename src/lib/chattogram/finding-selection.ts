// Which processed finding the page is about: the one named by the URL's `f`, carried from Explore to Evidence and the brief.
import type { Finding, ProcessedCase } from "./case-api";

export type FindingSelection = { kind: "none" } | { kind: "selected"; finding: Finding } | { kind: "unknown"; id: string };

export function selectFinding(pc: ProcessedCase | null, id: string | null): FindingSelection {
  if (!id || !pc) return { kind: "none" }; // a case still loading can't say yet whether it has the finding
  const finding = pc.findings.features.find((f) => f.properties.id === id);
  return finding ? { kind: "selected", finding } : { kind: "unknown", id };
}
