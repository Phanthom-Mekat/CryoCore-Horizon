"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { allScenes, api, toLoadError, type Load, type Region } from "@/lib/chattogram/api";
import type { ExplorerData } from "@/lib/explorer-data";
import { compatibility, covers, stacks, toAcquisition, type Acquisition } from "@/lib/chattogram/acquisitions";
import { FOCUS, loadFrozen, type FrozenCurated, type FrozenPilot } from "@/lib/chattogram/frozen";
import { CASE_ID, isBusy, type ProcessedCase } from "@/lib/chattogram/case-api";

const POLL_MS = 3000;
const FROZEN_PROCESSED: Load<never> = { status: "unavailable", reason: "This frozen case was captured before the processed case was published" };
import { publishCaseSource } from "@/lib/chattogram/sourceStore";
import { pilotOf, type ProcessedCase as PilotCase } from "@/lib/chattogram/processed";
import { loadRain, type RainSeries } from "@/lib/chattogram/rain";

export { FOCUS };
export const DEFAULT_VIEW = { lon: 91.85, lat: 22.4, zoom: 8.2 };

export type View = { lon: number; lat: number; zoom: number };
export type Stack = { id: string; items: Acquisition[] };

type Data = { region: Region; explorer: ExplorerData; acquisitions: Acquisition[]; stacks: Stack[] };
/**
 * Where the case came from. `live`: the backend's stored NASA catalogue (images still come from the frozen case when it
 * has them: same granule, same processing). `frozen`: the snapshot in public/data/chattogram/case, replayed with no
 * backend, NASA or ASF request — chosen with ?source=frozen or NEXT_PUBLIC_CASE_SOURCE=frozen, or used because the
 * backend is down (`fallback`).
 */
export type CaseSource = { mode: "live" | "frozen"; frozenAt: string | null; fallback: boolean };
type Ctx = {
  load: Load<Data>;
  /** The backend's division view (boundary, footprints, counts). Present even when no scene overlaps yet. */
  explorer: ExplorerData | null;
  source: CaseSource;
  /** Rainfall context (plan F13), a static file, so it is the same live or frozen. Null if not shipped. */
  rain: RainSeries | null;
  /** The calibrated pilot in the shipped snapshot, if it has one; pages use it while replaying. */
  frozenPilot: FrozenPilot | null;
  /** The curated case in the shipped snapshot, if it has one; used while replaying. */
  frozenCurated: FrozenCurated | null;
  reload: () => void;
  /** Selection, all of it mirrored in the URL so any view can be shared as a link. */
  stack: Stack | null;
  before: Acquisition | null;
  after: Acquisition | null;
  view: View;
  pick: string | null; // the acquisition highlighted on the map
  /** The selected processed finding (URL `f`). */
  finding: string | null;
  set: (patch: Partial<{ stack: string; a: string; b: string; view: View; pick: string | null; f: string | null }>) => void;
  /** The processed case from the backend: its status always, layers/findings/timeseries once it is ready (else empty). */
  processed: Load<ProcessedCase>;
  /** True when the selected before/after are exactly the processed case's pair. */
  isCasePair: boolean;
  /** A page opened on the processed case's stack and pair (null until both its scenes are in the catalogue). */
  caseHref: (path: string) => string | null;
  /** Same page with the current selection, for nav links. */
  href: (path: string) => string;
};

const CaseContext = createContext<Ctx | null>(null);

export function CaseProvider({ children }: { children: ReactNode }) {
  const params = useSearchParams();
  const [load, setLoad] = useState<Load<Data>>({ status: "loading" });
  const [explorer, setExplorer] = useState<ExplorerData | null>(null);
  const [source, setSource] = useState<CaseSource>({ mode: "live", frozenAt: null, fallback: false });
  const [tick, setTick] = useState(0);
  const [processed, setProcessed] = useState<Load<ProcessedCase>>({ status: "loading" });
  const [rain, setRain] = useState<RainSeries | null>(null);
  const [frozenPilot, setFrozenPilot] = useState<FrozenPilot | null>(null);
  const [frozenCurated, setFrozenCurated] = useState<FrozenCurated | null>(null);
  useEffect(() => {
    loadRain().then(setRain);
  }, []);
  const wanted = params.get("source") ?? process.env.NEXT_PUBLIC_CASE_SOURCE ?? "live";

  useEffect(() => {
    let live = true;
    const apply = (ex: ExplorerData, acquisitions: Acquisition[], src: CaseSource) => {
      setExplorer(ex);
      setSource(src);
      publishCaseSource(src); // for the header's Live | Frozen switch
      if (!acquisitions.length)
        return setLoad({ status: "empty", reason: "No stored NISAR GCOV scene overlaps the division yet. Open the Scene catalogue and run “Discover observations” to fetch them from NASA." });
      // stacks over the focus point first: those are the ones a before/after comparison can use there
      const over = stacks(acquisitions.filter((a) => covers(a, FOCUS.lonLat)));
      const rest = stacks(acquisitions).filter((s) => !over.some((o) => o.id === s.id));
      setLoad({ status: "ready", data: { region: ex.region, explorer: ex, acquisitions, stacks: [...over, ...rest] } });
    };
    (async () => {
      const frozen = await loadFrozen();
      if (!live) return;
      setFrozenPilot(frozen?.pilot ?? null);
      setFrozenCurated(frozen?.curated ?? null);
      const replay = (fallback: boolean) => {
        if (!frozen) return false;
        apply(frozen.explorer, frozen.acquisitions, { mode: "frozen", frozenAt: frozen.frozenAt, fallback });
        return true;
      };
      if (wanted === "frozen") {
        if (!replay(false)) setLoad({ status: "unavailable", reason: "This copy of the site has no frozen case. Run `pnpm freeze-case` with the backend running." });
        return;
      }
      try {
        const [ex, scenes] = await Promise.all([api.explorer(), allScenes("GCOV")]);
        if (!live) return;
        // only scenes the backend found intersecting the division polygon (not just its bounding box)
        const inside = new Set(ex.scenes.features.map((f) => f.properties.id));
        const assets = new Map((frozen?.acquisitions ?? []).flatMap((a) => (a.frozen ? [[a.conceptId, a.frozen] as const] : [])));
        const acquisitions = scenes
          .map(toAcquisition)
          .filter((a) => inside.has(a.conceptId) && a.footprint.length >= 3 && a.day)
          .map((a) => (assets.has(a.conceptId) ? { ...a, frozen: assets.get(a.conceptId) } : a));
        apply(ex, acquisitions, { mode: "live", frozenAt: frozen?.frozenAt ?? null, fallback: false });
      } catch (e) {
        if (!live) return;
        const err = toLoadError(e);
        // the backend is down: replay the frozen case rather than show nothing, and say so on every page
        if (err.status === "unavailable" && replay(true)) return;
        setLoad(err);
      }
    })();
    return () => {
      live = false;
    };
  }, [tick, wanted]);

  // The processed case loads on its own, so a backend without /cases (or a case still processing) never blocks the
  // catalogue views. While the backend is working on it, the case (with its job) is polled every few seconds.
  useEffect(() => {
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const empty = { layers: [], findings: { type: "FeatureCollection" as const, features: [] }, timeseries: { units: "dB" as const, points: [] } };
    if (wanted === "frozen") return; // a replay asks nothing live (see `shownProcessed`)
    const poll = () =>
      api
        .case(CASE_ID)
        .then(async (detail) => {
          if (!live) return;
          if (detail.status !== "ready") {
            setProcessed({ status: "ready", data: { detail, ...empty } });
            if (isBusy(detail)) timer = setTimeout(poll, POLL_MS);
            return;
          }
          const [layers, findings, timeseries] = await Promise.all([
            api.layers(CASE_ID),
            api.findings(CASE_ID),
            api.timeseries(CASE_ID).catch(() => empty.timeseries), // the chart is optional; the case is not
          ]);
          if (live) setProcessed({ status: "ready", data: { detail, layers, findings, timeseries } });
        })
        .catch((e) => live && setProcessed(toLoadError(e)));
    poll();
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [tick, wanted]);

  // a replay (chosen, or the fallback when the backend is down) shows the snapshot's curated case, never a live one
  const shownProcessed: Load<ProcessedCase> =
    source.mode === "frozen" ? (frozenCurated ? { status: "ready", data: { detail: frozenCurated.detail, layers: frozenCurated.layers, findings: frozenCurated.findings, timeseries: frozenCurated.timeseries } } : FROZEN_PROCESSED) : processed;
  const data = load.status === "ready" ? load.data : null;
  const q = (k: string) => params.get(k);

  const stack = useMemo(() => (data ? (data.stacks.find((s) => s.id === q("stack")) ?? data.stacks[0] ?? null) : null), [data, params]); // eslint-disable-line react-hooks/exhaustive-deps
  const byDay = (d: string | null) => stack?.items.find((i) => i.day === d) ?? null;
  const fair = useMemo(() => (stack ? defaultPair(stack.items) : null), [stack]);
  const before = byDay(q("a")) ?? fair?.[0] ?? null;
  const after = byDay(q("b")) ?? fair?.[1] ?? null;
  const v = (q("v") ?? "").split(",").map(Number);
  const view: View = v.length === 3 && v.every(Number.isFinite) ? { lon: v[0], lat: v[1], zoom: v[2] } : DEFAULT_VIEW;

  // Selection changes rewrite the query string with the native History API, which Next.js syncs into
  // useSearchParams without starting a navigation. A router.replace here would be a navigation, and one fired by a
  // late map event cancels the link the user just clicked, bouncing them back to this page.
  const set: Ctx["set"] = useCallback((patch) => {
    const next = new URLSearchParams(window.location.search);
    if (patch.stack !== undefined) {
      next.set("stack", patch.stack);
      next.delete("a");
      next.delete("b");
    }
    if (patch.a !== undefined) next.set("a", patch.a);
    if (patch.b !== undefined) next.set("b", patch.b);
    if (patch.view) next.set("v", `${patch.view.lon.toFixed(4)},${patch.view.lat.toFixed(4)},${patch.view.zoom.toFixed(2)}`);
    if (patch.pick) next.set("pick", patch.pick);
    else if (patch.pick === null) next.delete("pick");
    if (patch.f) next.set("f", patch.f);
    else if (patch.f === null) next.delete("f");
    if (next.toString() !== window.location.search.slice(1)) window.history.replaceState(null, "", `?${next}`);
  }, []);
  const href = useCallback((p: string) => (params.size ? `${p}?${params}` : p), [params]);

  const pd = shownProcessed.status === "ready" ? shownProcessed.data.detail : null;
  const isCasePair = !!pd && before?.granule === pd.before.granule && after?.granule === pd.after.granule;
  const caseHref = useCallback(
    (p: string) => {
      const a = pd && data?.acquisitions.find((x) => x.granule === pd.before.granule);
      const b = pd && data?.acquisitions.find((x) => x.granule === pd.after.granule);
      if (!a || !b || a.stack !== b.stack) return null;
      const next = new URLSearchParams(params);
      next.set("stack", a.stack);
      next.set("a", a.day);
      next.set("b", b.day);
      return `${p}?${next}`;
    },
    [pd, data, params],
  );

  const value: Ctx = {
    load,
    explorer,
    source,
    rain,
    frozenPilot,
    frozenCurated,
    reload: () => setTick((t) => t + 1),
    stack,
    before,
    after,
    view,
    pick: q("pick"),
    finding: q("f"),
    set,
    href,
    processed: shownProcessed,
    isCasePair,
    caseHref,
  };
  return (
    <CaseContext.Provider value={value}>
      {pd?.synthetic_fixture && (
        <div className="c-synthetic" role="alert">
          <strong>SYNTHETIC QA DATA — NOT NISAR</strong>
          <span>This case was processed from generated test fixtures to check the pipeline. Every layer, number and finding on these pages is made up.</span>
        </div>
      )}
      {children}
    </CaseContext.Provider>
  );
}

export function useCase() {
  const c = useContext(CaseContext);
  if (!c) throw new Error("useCase must be used inside CaseProvider");
  return c;
}

/** The calibrated pilot: from the backend's /cases API, or from the snapshot while replaying (no live request then). */
export function usePilot(): Load<PilotCase> {
  const { source, frozenPilot } = useCase();
  const replaying = source.mode === "frozen";
  const [pilot, setPilot] = useState<Load<PilotCase>>({ status: "loading" });
  useEffect(() => {
    if (replaying) return;
    api.cases().then(
      (c) => {
        const p = pilotOf(c);
        setPilot(p ? { status: "ready", data: p } : { status: "empty", reason: "" });
      },
      (e) => setPilot(toLoadError(e)),
    );
  }, [replaying]);
  // a live result fetched before switching to the frozen case must not show in the replay
  if (!replaying) return pilot;
  return frozenPilot ? { status: "ready", data: frozenPilot.case } : { status: "unavailable", reason: "" };
}

/**
 * The default comparison: the widest-spaced pair of dates that passes every compatibility check (same geometry,
 * polarizations, maturity and version). Falls back to the oldest and newest dates when no pair passes.
 */
function defaultPair(items: Acquisition[]): [Acquisition, Acquisition] | null {
  if (!items.length) return null;
  const sorted = [...items].sort((a, b) => a.start.localeCompare(b.start));
  let best: [Acquisition, Acquisition] | null = null;
  for (let i = 0; i < sorted.length; i++)
    for (let j = i + 1; j < sorted.length; j++)
      if (compatibility(sorted[i], sorted[j]).every((c) => c.ok) && (!best || Date.parse(sorted[j].start) - Date.parse(sorted[i].start) > Date.parse(best[1].start) - Date.parse(best[0].start)))
        best = [sorted[i], sorted[j]];
  return best ?? [sorted[0], sorted[sorted.length - 1]];
}
