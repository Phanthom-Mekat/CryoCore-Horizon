"use client";

import { useCallback } from "react";
import Link from "next/link";
import { Columns2, ExternalLink, FileText } from "lucide-react";
import { covers, type Acquisition } from "@/lib/chattogram/acquisitions";
import { fmtDate, fmtNum, fmtSize, fmtTime } from "@/lib/i18n/format";
import { useT } from "@/lib/i18n/useT";
import { CaseMap } from "../CaseMap";
import { FOCUS, useCase } from "../CaseProvider";
import { CaseBar } from "../CaseBar";
import { RainCard } from "../RainCard";
import { Timeline } from "../Timeline";

export function ExploreView() {
  const { load, stack, before, after, view, pick, set, href } = useCase();
  const t = useT();
  const e = t.explore;
  const onMove = useCallback((v: typeof view) => set({ view: v }), [set]);
  const onPick = useCallback((a: Acquisition) => set({ pick: a.conceptId }), [set]);
  if (load.status !== "ready" || !stack) return null;

  const shown = stack.items.find((a) => a.conceptId === pick) ?? after ?? stack.items[0];
  const overFocus = load.data.stacks.filter((s) => covers(s.items[0], FOCUS.lonLat));
  const marks: Record<string, string> = {};
  if (before) marks[before.conceptId] = t.before;
  if (after) marks[after.conceptId] = t.after;
  const num = (v: number | null) => (v === null ? "–" : fmtNum(v));
  const prov = load.data.region.provenance;

  return (
    <>
      <CaseBar
        title={e.title}
        actions={
          <Link className="c-btn is-primary" href={href("/chattogram/compare")}>
            <Columns2 size={16} aria-hidden="true" />
            {e.compare}
          </Link>
        }
      />
    <div className="c-explore">
      <section className="c-stage" aria-label={e.mapRegion}>
        <CaseMap
          label={e.mapLabel(t.place.focus, fmtDate(shown.start))}
          view={view}
          onMove={onMove}
          image={shown}
          footprints={stack.items}
          selected={shown.conceptId}
          onPick={(id) => id && set({ pick: id })}
          boundary={load.data.region.boundary}
        />
        <Timeline items={stack.items} current={shown.conceptId} onPick={onPick} marks={marks} />
      </section>

      <aside className="c-panel" aria-label={e.panel}>
        <div className="c-panel-block">
          <label className="c-label" htmlFor="stack">
            {e.stack}
          </label>
          <select id="stack" className="c-select" value={stack.id} onChange={(e) => set({ stack: e.target.value })}>
            {overFocus.map((s) => (
              <option key={s.id} value={s.id}>
                {e.stackOption(num(s.items[0].track), num(s.items[0].frame), t.direction[s.items[0].direction], fmtNum(s.items.length))}
              </option>
            ))}
          </select>
          <p className="c-hint">{e.stackHint(t.place.focus)}</p>
        </div>

        <div className="c-panel-block">
          <p className="c-label">{e.shown}</p>
          <h2 className="c-acq-date">{fmtDate(shown.start)}</h2>
          <dl className="c-facts">
            <div>
              <dt>{e.time}</dt>
              <dd>{fmtTime(shown.start)}</dd>
            </div>
            <div>
              <dt>{e.polarizations}</dt>
              <dd>{shown.polarizations.join(" + ") || "–"}</dd>
            </div>
            <div>
              <dt>{e.frequencies}</dt>
              <dd>{shown.frequencies.length ? shown.frequencies.map((f) => e.band(f)).join(", ") : "–"}</dd>
            </div>
            <div>
              <dt>{e.orbit}</dt>
              <dd>{num(shown.orbit)}</dd>
            </div>
            <div>
              <dt>{e.product}</dt>
              <dd>GCOV v{shown.version ?? "?"}</dd>
            </div>
            <div>
              <dt>{e.maturity}</dt>
              <dd className={shown.maturity ? "is-warn" : undefined}>{t.maturity[shown.maturity ?? "none"]}</dd>
            </div>
            <div>
              <dt>{e.file}</dt>
              <dd>{fmtSize(shown.sizeBytes)} HDF5</dd>
            </div>
          </dl>
          <div className="c-links">
            {shown.qaReport && (
              <a className="c-btn" href={shown.qaReport} target="_blank" rel="noreferrer">
                <FileText size={15} aria-hidden="true" />
                {e.qa}
              </a>
            )}
            {shown.dataUrl && (
              <a className="c-btn" href={shown.dataUrl} target="_blank" rel="noreferrer" title={e.hdf5Title}>
                <ExternalLink size={15} aria-hidden="true" />
                {e.hdf5}
              </a>
            )}
          </div>
        </div>

        <div className="c-panel-block">
          <p className="c-label">{e.legend}</p>
          <ul className="c-legend">
            <li>
              <i className="c-key c-key-rgb" aria-hidden="true" />
              {e.legendRgb}
            </li>
            <li>
              <i className="c-key c-key-foot" aria-hidden="true" />
              {e.legendFoot}
            </li>
            <li>
              <i className="c-key c-key-env" aria-hidden="true" />
              {e.legendDivision(fmtNum(prov.year), prov.source)}
            </li>
          </ul>
        </div>
      </aside>
    </div>
      <RainCard mode="stack" />
    </>
  );
}
