"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { DATA_ROOT, checkData, deriveAlerts, loadDashboardData, type Alert } from "@/lib/dashboard-data";

type Data = Awaited<ReturnType<typeof loadDashboardData>>;
type Ctx = Data & { alerts: Alert[]; pairIdx: number; setPairIdx: (i: number) => void };
type State = { value: Ctx | null; error: string | null; problems: string[] };

const DashboardContext = createContext<State>({ value: null, error: null, problems: [] });

/** Loads the glacier data once for every dashboard route and holds the selected pass pair. */
export function DashboardProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pairIdx, setPairIdx] = useState<number | null>(null);

  useEffect(() => {
    loadDashboardData().then(setData, (e: Error) => setError(e.message));
  }, []);

  const state = useMemo<State>(() => {
    if (!data) return { value: null, error, problems: [] };
    const problems = checkData(data.manifest, data.timeseries, data.fronts);
    if (problems.length) return { value: null, error: "The data files don’t match the format the dashboard expects", problems };
    const last = data.manifest.pairs.length - 1;
    return {
      value: {
        ...data,
        alerts: deriveAlerts(data.timeseries, data.fronts),
        pairIdx: pairIdx ?? last,
        setPairIdx: (i) => setPairIdx(Math.max(0, Math.min(last, i))),
      },
      error,
      problems: [],
    };
  }, [data, error, pairIdx]);

  return <DashboardContext.Provider value={state}>{children}</DashboardContext.Provider>;
}

/** Shows the page once the data is in, or says plainly why it isn't. The shell around it renders straight away. */
export function DataGate({ children }: { children: ReactNode }) {
  const { value, error, problems } = useContext(DashboardContext);
  if (error)
    return (
      <div className="d-state" role="alert">
        <h2>The glacier data didn’t load</h2>
        <p>
          {error}. Files are read from <code>public{DATA_ROOT}</code>; the format is described in <code>docs/DATA_CONTRACT.md</code>.
        </p>
        {problems.length > 0 && (
          <ul className="d-problems">
            {problems.slice(0, 12).map((p) => (
              <li key={p}>{p}</li>
            ))}
            {problems.length > 12 && <li>…and {problems.length - 12} more</li>}
          </ul>
        )}
      </div>
    );
  if (!value)
    return (
      <div className="d-state d-loading" aria-busy="true">
        <span className="d-spinner" aria-hidden="true" />
        <p>Loading glacier data…</p>
      </div>
    );
  return children;
}

export function useDashboard() {
  const v = useContext(DashboardContext).value;
  if (!v) throw new Error("useDashboard must be used inside DataGate");
  return v;
}

/** Same data for the shell (alert count, sample flag) without throwing while it loads. */
export const useDashboardMaybe = () => useContext(DashboardContext).value;
