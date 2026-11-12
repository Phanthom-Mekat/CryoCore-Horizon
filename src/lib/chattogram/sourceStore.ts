// Where the case data comes from right now (live backend or frozen snapshot), shared outside React's tree so the header
// switch — rendered by the shared Shell, above the case provider — can show and change it. CaseProvider publishes;
// CaseSourceToggle subscribes.
export type SourceState = { mode: "live" | "frozen"; frozenAt: string | null; fallback: boolean };

let state: SourceState | null = null;
const listeners = new Set<() => void>();

export const getCaseSource = () => state;
export function publishCaseSource(next: SourceState) {
  state = next;
  listeners.forEach((l) => l());
}
export function subscribeCaseSource(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Switch between live data and the frozen snapshot without reloading: the choice goes into the URL (`?source=`), which
 * Next.js syncs into useSearchParams, and CaseProvider loads the other source. An explicit `live` also overrides a
 * deployment that defaults to frozen (NEXT_PUBLIC_CASE_SOURCE=frozen). Other selection in the URL is kept.
 */
export function switchCaseSource(mode: "live" | "frozen") {
  const q = new URLSearchParams(window.location.search);
  q.set("source", mode);
  window.history.replaceState(null, "", `?${q}`);
}
