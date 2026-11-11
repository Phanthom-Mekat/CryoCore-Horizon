"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { useDashboard } from "../DashboardProvider";
import { Card, Kpi, KpiStrip, PageHead } from "../ui";
import { CalendarDays, Images, Orbit, Satellite, Search } from "lucide-react";
import { fmtDay, season } from "@/lib/dashboard-data";

export function PassesView() {
  const { manifest, setPairIdx } = useDashboard();
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [onlyRadar, setOnlyRadar] = useState(false);
  const [newest, setNewest] = useState(true);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const all = manifest.passes.map((p, i) => ({ p, i }));
    const shown = all.filter(({ p }) => (!onlyRadar || p.radar) && (!needle || `${fmtDay(p.date)} ${p.date} ${season(p.date)}`.toLowerCase().includes(needle)));
    return newest ? shown.reverse() : shown;
  }, [manifest, q, onlyRadar, newest]);

  const first = manifest.passes[0];
  const last = manifest.passes[manifest.passes.length - 1];

  return (
    <>
      <PageHead crumbs={["NISAR passes"]} />
      <KpiStrip label="Pass catalogue summary">
        <Kpi label="Passes over the glacier" value={String(manifest.passes.length)} icon={Satellite} sub={`Track ${first.track}, frame ${first.frame}`} />
        <Kpi label="First pass" value={fmtDay(first.date)} icon={CalendarDays} sub={first.direction === "A" ? "Ascending" : "Descending"} />
        <Kpi label="Latest pass" value={fmtDay(last.date)} icon={Orbit} sub="Repeats every 12 days" />
        <Kpi label="With radar previews" value={String(manifest.passes.filter((p) => p.radar).length)} icon={Images} sub="Open them under Radar images" />
      </KpiStrip>
      <Card title="Pass catalogue" icon={Satellite} sub={`${rows.length} of ${manifest.passes.length} passes`}>
        <div className="d-filters">
          <label className="d-input">
            <Search size={15} aria-hidden="true" />
            <input type="search" placeholder="Search by date or season" aria-label="Search passes" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          <select aria-label="Sort passes" value={newest ? "new" : "old"} onChange={(e) => setNewest(e.target.value === "new")}>
            <option value="new">Sort: Newest first</option>
            <option value="old">Sort: Oldest first</option>
          </select>
          <label className="d-check">
            <input type="checkbox" checked={onlyRadar} onChange={(e) => setOnlyRadar(e.target.checked)} />
            Only passes with radar previews
          </label>
        </div>
        <div className="d-table-wrap">
          <table className="d-table">
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Season</th>
                <th scope="col">Direction</th>
                <th scope="col" className="num">Track</th>
                <th scope="col" className="num">Frame</th>
                <th scope="col">Radar preview</th>
                <th scope="col">Speed pair</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ p, i }) => {
                const pairI = Math.min(i, manifest.pairs.length - 1); // the pair starting here (the last pass ends the last pair)
                return (
                  <tr key={p.date}>
                    <th scope="row">{fmtDay(p.date)}</th>
                    <td>{season(p.date)}</td>
                    <td>{p.direction === "A" ? "Ascending" : "Descending"}</td>
                    <td className="num">{p.track}</td>
                    <td className="num">{p.frame}</td>
                    <td>{p.radar ? <span className="d-pill is-ok">Available</span> : <span className="d-pill">None</span>}</td>
                    <td>
                      <button
                        type="button"
                        className="d-link-btn"
                        onClick={() => {
                          setPairIdx(pairI);
                          router.push("/dashboard/speed");
                        }}
                      >
                        Open on the map
                      </button>
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="d-empty">
                    No passes match “{q}”. Try a month name such as “Jul”, or clear the search.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
