"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { Columns2, ExternalLink, FileText } from "lucide-react";
import { covers, type Acquisition } from "@/lib/chattogram/acquisitions";
import { fmtDate, fmtNum, fmtSize, fmtTime } from "@/lib/i18n/format";
import { useT } from "@/lib/i18n/useT";
import { CaseMap } from "../CaseMap";
import { CASE_ID, layerImage, type LayerId } from "@/lib/chattogram/case-api";
import { FOCUS, useCase } from "../CaseProvider";
import { CaseBar } from "../CaseBar";
import { RainCard } from "../RainCard";
import { Timeline } from "../Timeline";
import { ChangeKey, DbKey, FindingKey } from "../MapKey";
import { FindingPanel } from "../FindingPanel";
import { PrepStatus } from "../PrepStatus";

export function ExploreView() {
  const { load, stack, before, after, view, pick, set, href, processed, finding, caseHref } = useCase();
  const t = useT();
  const e = t.explore;
  const onMove = useCallback((v: typeof view) => set({ view: v }), [set]);
  // which raster is on the map: a processed layer of the case (signed change first), or the selected date's quicklook
  const [layer, setLayer] = useState<LayerId | "quicklook">("change_db");
  // picking a date shows its quicklook: the processed layers belong to the case pair only
  const onPick = useCallback(
    (a: Acquisition) => {
      set({ pick: a.conceptId });
      setLayer("quicklook");
    },
    [set],
  );
  const onFinding = useCallback((f: string) => set({ f }), [set]);
  const [showFindings, setShowFindings] = useState(true);
  if (load.status !== "ready" || !stack) return null;

  const detail = processed.status === "ready" ? processed.data.detail : null;
  const pc = detail?.status === "ready" && processed.status === "ready" ? processed.data : null;
  const shownLayer = pc?.layers.find((l) => l.id === layer) ?? null;
  const overlay =
    pc && shownLayer
      ? { ...layerImage(CASE_ID, shownLayer, pc.detail.updated_at), label: `${shownLayer.label}${shownLayer.date ? `, ${fmtDate(shownLayer.date)}` : ""}` }
      : null;
  const selFinding = pc?.findings.features.find((f) => f.properties.id === finding) ?? null;
  const toCase = detail ? caseHref("/chattogram/explore") : null;
  const onCaseStack = !!detail && stack.items.some((a) => a.granule === detail.before.granule);

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
      <p className="c-compare-foot"><Link href="/chattogram/processed">Open the calibrated radar pilot →</Link> · Measured HH/HV layers and signed change for the July–October subset.</p>
    <div className="c-explore">
      <section className="c-stage" aria-label={e.mapRegion}>
        <CaseMap
          label={overlay ? `Map of ${FOCUS.name} with ${overlay.label}` : e.mapLabel(t.place.focus, fmtDate(shown.start))}
          view={view}
          onMove={onMove}
          image={overlay ? null : shown}
          processed={overlay}
          footprints={stack.items}
          selected={shown.conceptId}
          onPick={(id) => {
            const a = id && stack.items.find((x) => x.conceptId === id);
            if (a) onPick(a);
          }}
          boundary={load.data.region.boundary}
          area={detail?.analysis_area ?? null}
          areaName={detail ? `${detail.title} · analysis area` : undefined}
          findings={pc && showFindings ? pc.findings : null}
          selectedFinding={selFinding?.properties.id ?? null}
          onFinding={onFinding}
        />
        <Timeline items={stack.items} current={shown.conceptId} onPick={onPick} marks={marks} summary={pc?.timeseries.points} />
      </section>

      <aside className="c-panel" aria-label={e.panel}>
        {selFinding && pc && <FindingPanel key={selFinding.properties.id} finding={selFinding} detail={pc.detail} onClose={() => set({ f: null })} />}

        <div className="c-panel-block">
          {pc ? (
            <>
              <p className="c-label">Processed case · {pc.detail.title}</p>
              <fieldset className="c-layers">
                <legend className="c-hint">
                  Calibrated layers of {fmtDate(pc.detail.before.date)} → {fmtDate(pc.detail.after.date)}, inside the analysis rectangle
                </legend>
                {pc.layers.map((l) => (
                  <label key={l.id}>
                    <input type="radio" name="layer" checked={layer === l.id} onChange={() => setLayer(l.id)} />
                    {l.label}
                    {l.date ? ` (${fmtDate(l.date)})` : ""}
                  </label>
                ))}
                <label>
                  <input type="radio" name="layer" checked={!shownLayer} onChange={() => setLayer("quicklook")} />
                  Browse quicklook of the selected date
                </label>
                <label>
                  <input type="checkbox" checked={showFindings} onChange={(ev) => setShowFindings(ev.target.checked)} />
                  Areas of observed change ({pc.findings.features.length})
                </label>
              </fieldset>
              {shownLayer?.palette === "diverging" && <ChangeKey limit={Math.max(Math.abs(shownLayer.scale.min), Math.abs(shownLayer.scale.max))} />}
              {shownLayer?.palette === "gray" && <DbKey min={shownLayer.scale.min} max={shownLayer.scale.max} title={`${shownLayer.label}, ${shownLayer.units}`} />}
              {shownLayer && <p className="c-hint">{shownLayer.crs_note}</p>}
              {showFindings && pc.findings.features.length > 0 && (
                <>
                  <FindingKey />
                  <p className="c-hint">Click an outlined area for what changed, why we think so and what is uncertain.</p>
                </>
              )}
              {showFindings && !pc.findings.features.length && <p className="c-hint">No area passed the method’s change threshold.</p>}
              {!onCaseStack && toCase && (
                <p className="c-hint">
                  The timeline shows another stack. <Link href={toCase}>Open the case’s stack and dates</Link>
                </p>
              )}
            </>
          ) : (
            <PrepStatus compact />
          )}
        </div>
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
          <p className="c-label">{overlay ? "Selected date (its quicklook is hidden under the processed layer)" : e.shown}</p>
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
              {overlay ? "Processed layer above: calibrated γ⁰ from the GCOV files, in dB." : e.legendRgb}
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
