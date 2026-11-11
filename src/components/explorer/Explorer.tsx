"use client";

import dynamic from "next/dynamic";
import { Kpi, KpiStrip, PageHead } from "@/components/dashboard/ui";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, MotionConfig } from "motion/react";
import { ArrowDownToLine, ArrowRight, ArrowUpRight, ChevronLeft, ChevronRight, Compass, Database, ExternalLink, Info, Layers, LoaderCircle, Radar, RefreshCw, Satellite, X } from "lucide-react";
import { formatDate, getJSON, type ExplorerData } from "@/lib/explorer-data";

const StudyMap = dynamic(() => import("./StudyMap"), { ssr: false, loading: () => <div className="atlas-map-loading"><Radar size={32} /><p>Preparing the observation map…</p></div> });

export function Explorer() {
  const [data, setData] = useState<ExplorerData | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [day, setDay] = useState<string | null>(null);
  const [start, setStart] = useState("2025-10-01");
  const [end, setEnd] = useState("2026-11-12");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [search, setSearch] = useState<{ page: number; hits: number; hasMore: boolean; start: string; end: string } | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    const result = await getJSON<ExplorerData>("/api/earth/explorer", { signal });
    setData(result);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal).catch(e => { if (e.name !== "AbortError") setError(e.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [load]);

  async function searchNASA(nextPage = false) {
    if (start > end) { setError("Choose an end date on or after the start date."); return; }
    setBusy(true); setError(null);
    const page = nextPage && search ? search.page + 1 : 1;
    const range = nextPage && search ? search : { start, end };
    try {
      const result = await getJSON<{ total_hits: number; has_more: boolean }>("/api/earth/search", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ start_date: range.start, end_date: range.end, product: "GCOV", page_size: 100, page }),
      });
      setSearch({ page, hits: result.total_hits, hasMore: result.has_more, start: range.start, end: range.end });
      await load(); setDay(null); setSelected(null);
    } catch (e) { setError(e instanceof Error ? e.message : "Search failed. Please retry."); }
    finally { setBusy(false); }
  }

  const scenes = useMemo(() => ({ type: "FeatureCollection" as const, features: data?.scenes.features.filter(f => !day || f.properties.date?.startsWith(day)) ?? [] }), [data, day]);
  const chosen = scenes.features.find(f => f.properties.id === selected)?.properties;
  const activeIndex = data?.timeline.findIndex(t => t.date === day) ?? -1;
  const selectDay = (value: string | null) => { setDay(value); setSelected(null); };

  return <MotionConfig reducedMotion="user"><div className="atlas">
    <PageHead root={{ href: "/explore", label: "Chattogram" }} crumbs={["Observations"]} actions={<button className="d-btn" aria-label="Explore the data sources" onClick={() => setSourceOpen(!sourceOpen)} aria-expanded={sourceOpen}><Database size={16} />Data and sources</button>} />

    <div className="atlas-intro"><div><p className="atlas-eyebrow">NASA–ISRO NISAR · BANGLADESH</p><h1>Chattogram observations</h1><p>Explore acquisition dates, radar footprints, and the evidence behind each scene.</p></div>
    </div>

    {sourceOpen && <section className="atlas-provenance" aria-label="Data sources"><div><h2>Every layer has a source.</h2><p>NISAR footprints: NASA Earthdata CMR / ASF DAAC. These are metadata extents, not processed radar imagery.</p><p>Boundary: {data?.region.provenance.source ?? "BBS / HDX via geoBoundaries"}. Reference year: 2018, not verified as the current legal boundary. Display geometry is simplified; spatial filtering uses the original polygon.</p></div><div><a href="https://nisar-docs.asf.alaska.edu/gcov/" target="_blank" rel="noreferrer">NISAR product guide <ExternalLink size={13} /></a><a href="https://data.humdata.org/dataset/cod-ab-bgd" target="_blank" rel="noreferrer">Boundary source <ExternalLink size={13} /></a><a href="https://creativecommons.org/licenses/by/3.0/igo/" target="_blank" rel="noreferrer">Boundary license: CC BY 3.0 IGO <ExternalLink size={13} /></a><small>Context imagery: NASA GIBS / Blue Marble. Static background, not current conditions or NISAR imagery. Tilt is a camera perspective, not a terrain model.</small></div></section>}

    <KpiStrip label="Stored catalog summary">
      <Kpi label="Study region" value="Chattogram" sub="Division, Bangladesh" icon={Compass} />
      <Kpi label="Intersecting scenes" value={String(data?.summary.intersecting_records ?? "—")} sub="Stored catalog records" icon={Layers} />
      <Kpi label="Observation days" value={String(data?.summary.observation_days ?? "—")} sub="Distinct acquisition dates" icon={Radar} />
      <Kpi label="Primary dataset" value="NISAR" sub="L2 · GCOV" icon={Satellite} />
    </KpiStrip>

    {error && <div className="atlas-error" role="alert"><Info size={18} /><span>{error}</span><button onClick={async () => { setError(null); setLoading(true); try { await load(); } catch (e) { setError((e as Error).message); } finally { setLoading(false); } }}>Retry</button></div>}
    <div className="atlas-workspace" id="atlas-content">
      <section className="atlas-map-column" aria-label="Chattogram map and observation dates">
        <div className="atlas-map-heading"><span><Compass size={18} /> Observation map</span><span>22°N · 92°E <i>WGS 84</i></span></div>
        {data ? <StudyMap data={data} scenes={scenes} selected={selected} onSelect={setSelected} /> : <div className="atlas-map-loading"><Radar size={36} /><h2>{loading ? "Connecting to the catalog…" : "The atlas is waiting for data."}</h2><p>{loading ? "Loading the boundary and stored NASA observations." : "Start the backend, then retry above."}</p></div>}
        <div className="atlas-timeline"><div className="atlas-timeline-head"><div><p className="atlas-eyebrow">ACQUISITION TIMELINE</p><strong>{day ? formatDate(day) : "Every observation leaves a trace."}</strong></div><button onClick={() => selectDay(null)} disabled={!day}>All dates</button></div>
          <div className="atlas-bars" aria-label="Filter scenes by acquisition date">{data?.timeline.map(t => <button key={t.date} title={`${formatDate(t.date)} · ${t.count} records`} aria-label={`${formatDate(t.date)}, ${t.count} records`} aria-pressed={day === t.date} onClick={() => selectDay(day === t.date ? null : t.date)}><span style={{ height: `${Math.max(12, t.count / Math.max(...data.timeline.map(d => d.count)) * 44)}px` }} /></button>)}</div>
          <div className="atlas-timeline-foot"><span>{data?.timeline.length ? formatDate(data.timeline[0].date) : "No acquisition dates stored"}</span><span>Each bar is an acquisition day · spacing is categorical</span><span>{data?.timeline.length ? formatDate(data.timeline.at(-1)!.date) : ""}</span></div>
          {day && <div className="atlas-date-step"><button disabled={activeIndex <= 0} onClick={() => selectDay(data!.timeline[activeIndex - 1].date)}><ChevronLeft size={14} />Earlier</button><button disabled={activeIndex >= (data?.timeline.length ?? 0) - 1} onClick={() => selectDay(data!.timeline[activeIndex + 1].date)}>Later<ChevronRight size={14} /></button></div>}
        </div>
      </section>

      <aside className="atlas-sidebar" aria-label="NASA observations"><div className="atlas-sidebar-title"><div><p className="atlas-eyebrow">NASA EARTHDATA / ASF</p><h2>Scene notebook</h2></div><Satellite size={23} /></div>
        <form className="atlas-search" onSubmit={e => { e.preventDefault(); void searchNASA(); }}><div><label>From<input type="date" required value={start} onChange={e => setStart(e.target.value)} disabled={busy} /></label><label>To<input type="date" required value={end} min={start} onChange={e => setEnd(e.target.value)} disabled={busy} /></label></div><button className="atlas-primary" disabled={busy} type="submit">{busy ? <LoaderCircle size={16} className="atlas-spin" /> : <RefreshCw size={15} />}{busy ? "Searching NASA…" : "Discover observations"}<ArrowRight size={15} /></button><p>Search dates add records to the local catalog. The map shows all stored dates; use the timeline to filter.</p></form>
        {search && <div className="atlas-search-result" role="status">Retrieved {Math.min(search.page * 100, search.hits)} of {search.hits} bounding-box matches.{search.hasMore && <button disabled={busy} onClick={() => void searchNASA(true)}>Load next page <ArrowDownToLine size={13} /></button>}</div>}
        <div className="atlas-list-label"><span>{day ? formatDate(day) : "STORED OBSERVATIONS"}</span><span>{scenes.features.length} scenes</span></div>
        <div className="atlas-scene-list">{scenes.features.map(f => <button className={`atlas-scene ${selected === f.properties.id ? "is-selected" : ""}`} key={f.properties.id} onClick={() => setSelected(selected === f.properties.id ? null : f.properties.id)} aria-pressed={selected === f.properties.id}><span className="atlas-scene-icon"><Layers size={18} /></span><span><strong>{formatDate(f.properties.date)}</strong><small>Track {f.properties.track ?? "—"} · {f.properties.direction === "ASCENDING" ? "Ascending" : f.properties.direction === "DESCENDING" ? "Descending" : "Direction unknown"}</small></span><span className="atlas-pol">{f.properties.polarization?.replaceAll(", ", "/") ?? "GCOV"}</span></button>)}{!scenes.features.length && <div className="atlas-empty"><Satellite size={28} /><strong>{loading ? "Loading observations" : "No matching footprints yet"}</strong><p>Discover NASA observations above. Only records with valid geometry intersecting the division appear here.</p></div>}</div>

        <AnimatePresence mode="wait">{chosen && <motion.section key={chosen.id} className="atlas-evidence" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} aria-label="Selected scene details"><div className="atlas-evidence-title"><span>SELECTED OBSERVATION</span><button aria-label="Close scene details" onClick={() => setSelected(null)}><X size={16} /></button></div><h3>{formatDate(chosen.date)}</h3><dl><div><dt>Track / frame</dt><dd>{chosen.track ?? "—"} / {chosen.frame ?? "—"}</dd></div><div><dt>Polarization · frequency A</dt><dd>{chosen.polarization ?? "Unavailable"}</dd></div><div><dt>Calibration maturity</dt><dd>{chosen.maturity}</dd></div><div><dt>CMR revision</dt><dd>{chosen.revision}</dd></div></dl><p className="atlas-granule">{chosen.name}</p><a href={chosen.source_url} target="_blank" rel="noreferrer">Inspect NASA source metadata <ArrowUpRight size={15} /></a><p className="atlas-evidence-note">Footprint overlap does not establish usable pixel coverage or a comparable before/after pair.</p></motion.section>}</AnimatePresence>
        <div className="atlas-note"><Info size={16} /><p>Observation discovery, not a change assessment. Radar processing and environmental interpretation come next.</p></div>
      </aside>
    </div>

    <footer className="atlas-footer"><span><span className="atlas-dot" />Sourced observations. Open questions.</span><p>{data ? `${data.summary.outside_division} stored records outside the division · ${data.summary.missing_geometry} without usable geometry · retrieved ${formatDate(data.summary.latest_retrieval)}` : "NASA–ISRO NISAR · Chattogram Division, Bangladesh"}</p><button onClick={() => { setSourceOpen(true); window.scrollTo({ top: 0, behavior: "auto" }); }}>Sources & limitations <ArrowUpRight size={13} /></button></footer>
  </div></MotionConfig>;
}
