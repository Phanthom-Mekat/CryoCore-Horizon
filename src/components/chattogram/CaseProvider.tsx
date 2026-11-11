"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { allScenes, api, toLoadError, type Load, type Region } from "@/lib/chattogram/api";
import { compatibility, covers, stacks, toAcquisition, type Acquisition } from "@/lib/chattogram/acquisitions";

/** The curated starting point: the city, which the most NISAR dates cover. Changing it only changes the default view. */
export const FOCUS = { name: "Chattogram city", lonLat: [91.8317, 22.3569] as [number, number] };
export const DEFAULT_VIEW = { lon: 91.85, lat: 22.4, zoom: 8.2 };

export type View = { lon: number; lat: number; zoom: number };
export type Stack = { id: string; items: Acquisition[] };

type Data = { region: Region; acquisitions: Acquisition[]; stacks: Stack[] };
type Ctx = {
  load: Load<Data>;
  reload: () => void;
  /** Selection, all of it mirrored in the URL so any view can be shared as a link. */
  stack: Stack | null;
  before: Acquisition | null;
  after: Acquisition | null;
  view: View;
  pick: string | null; // the acquisition highlighted on the map
  set: (patch: Partial<{ stack: string; a: string; b: string; view: View; pick: string | null }>) => void;
  /** Same page with the current selection, for nav links. */
  href: (path: string) => string;
};

const CaseContext = createContext<Ctx | null>(null);

export function CaseProvider({ children }: { children: ReactNode }) {
  const params = useSearchParams();
  const [load, setLoad] = useState<Load<Data>>({ status: "loading" });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let live = true;
    Promise.all([api.region(), allScenes("GCOV")])
      .then(([region, scenes]) => {
        if (!live) return;
        const acquisitions = scenes.map(toAcquisition).filter((a) => a.footprint.length >= 3 && a.day);
        if (!acquisitions.length)
          return setLoad({ status: "empty", reason: "The backend has no NISAR GCOV scenes stored yet. Run a NASA search (Explore → Fetch from NASA) to fill it." });
        // stacks over the focus point first: those are the ones a before/after comparison can use there
        const over = stacks(acquisitions.filter((a) => covers(a, FOCUS.lonLat)));
        const rest = stacks(acquisitions).filter((s) => !over.some((o) => o.id === s.id));
        setLoad({ status: "ready", data: { region, acquisitions, stacks: [...over, ...rest] } });
      })
      .catch((e) => live && setLoad(toLoadError(e)));
    return () => {
      live = false;
    };
  }, [tick]);

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
    if (next.toString() !== window.location.search.slice(1)) window.history.replaceState(null, "", `?${next}`);
  }, []);
  const href = useCallback((p: string) => (params.size ? `${p}?${params}` : p), [params]);

  const value: Ctx = { load, reload: () => setTick((t) => t + 1), stack, before, after, view, pick: q("pick"), set, href };
  return <CaseContext.Provider value={value}>{children}</CaseContext.Provider>;
}

export function useCase() {
  const c = useContext(CaseContext);
  if (!c) throw new Error("useCase must be used inside CaseProvider");
  return c;
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
