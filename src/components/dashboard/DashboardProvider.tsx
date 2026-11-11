"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { deriveAlerts, loadDashboardData, type Alert } from "@/lib/dashboard-data";

type Data = Awaited<ReturnType<typeof loadDashboardData>>;
type Ctx = Data & { alerts: Alert[]; pairIdx: number; setPairIdx: (i: number) => void };

const DashboardContext = createContext<Ctx | null>(null);

/** Loads the glacier data once for every dashboard route and holds the selected pass pair. */
export function DashboardProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pairIdx, setPairIdx] = useState<number | null>(null);

  useEffect(() => {
    loadDashboardData().then(setData, (e: Error) => setError(e.message));
  }, []);

  const value = useMemo<Ctx | null>(() => {
    if (!data) return null;
    const last = data.manifest.pairs.length - 1;
    return {
      ...data,
      alerts: deriveAlerts(data.timeseries, data.fronts),
      pairIdx: pairIdx ?? last,
      setPairIdx: (i) => setPairIdx(Math.max(0, Math.min(last, i))),
    };
  }, [data, pairIdx]);

  if (error)
    return (
      <div className="d-state" role="alert">
        <h2>The glacier data didn’t load</h2>
        <p>{error}. Check that public/data/jakobshavn exists, then reload the page.</p>
      </div>
    );
  if (!value)
    return (
      <div className="d-state" aria-busy="true">
        <p>Loading glacier data…</p>
      </div>
    );
  return <DashboardContext.Provider value={value}>{children}</DashboardContext.Provider>;
}

export function useDashboard() {
  const v = useContext(DashboardContext);
  if (!v) throw new Error("useDashboard must be used inside DashboardProvider");
  return v;
}

/** Same data for the shell (alert count, sample flag) without throwing while it loads. */
export const useDashboardMaybe = () => useContext(DashboardContext);
