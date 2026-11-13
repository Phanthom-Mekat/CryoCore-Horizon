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
import { BackendText } from "../BackendText";

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
  // the backend names layers in English; this reads them in the interface language where we have a translation
  const texts = t.processed.texts;
  const layerName = (l: { label: string }) => texts[l.label] ?? l.label;
  const overlay =
    pc && shownLayer
      ? { ...layerImage(CASE_ID, shownLayer, pc.detail.updated_at), label: `${layerName(shownLayer)}${shownLayer.date ? `, ${fmtDate(shownLayer.date)}` : ""}` }
      : null;
  // the area name is drawn by the map in WebGL, which can't shape Bengali, so it stays as the backend writes it
  const areaName = detail ? `${detail.title} · analysis area` : undefined;
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
      <p className="c-compare-foot"><Link href="/chattogram/processed">{e.pilotLink}</Link> · {e.pilotNote}</p>
    <div className="c-explore">
      <section className="c-stage" aria-label={e.mapRegion}>
        <CaseMap
          label={overlay ? e.mapLabelLayer(t.place.focus, overlay.label) : e.mapLabel(t.place.focus, fmtDate(shown.start))}
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
          areaName={areaName}
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
              <p className="c-label">
                {e.processedCase} · <BackendText text={pc.detail.title} translated={t.overview.caseTitles[pc.detail.id]} />
              </p>
              <fieldset className="c-layers">
                <legend className="c-hint">
                  {e.layersOf(fmtDate(pc.detail.before.date), fmtDate(pc.detail.after.date))}
                </legend>
                {pc.layers.map((l) => (
                  <label key={l.id}>
                    <input type="radio" name="layer" checked={layer === l.id} onChange={() => setLayer(l.id)} />
                    <BackendText text={l.label} translated={texts[l.label]} />
                    {l.date ? ` (${fmtDate(l.date)})` : ""}
                  </label>
                ))}
                <label>
                  <input type="radio" name="layer" checked={!shownLayer} onChange={() => setLayer("quicklook")} />
                  {e.quicklookLayer}
                </label>
                <label>
                  <input type="checkbox" checked={showFindings} onChange={(ev) => setShowFindings(ev.target.checked)} />
                  {e.findingsToggle(fmtNum(pc.findings.features.length))}
                </label>
              </fieldset>
              {shownLayer?.palette === "diverging" && <ChangeKey limit={Math.max(Math.abs(shownLayer.scale.min), Math.abs(shownLayer.scale.max))} />}
              {shownLayer?.palette === "gray" && <DbKey min={shownLayer.scale.min} max={shownLayer.scale.max} layer={shownLayer.label} />}
              {shownLayer && <p className="c-hint"><BackendText text={shownLayer.crs_note} translated={texts[shownLayer.crs_note]} /></p>}
              {showFindings && pc.findings.features.length > 0 && (
                <>
                  <FindingKey />
                  <p className="c-hint">{e.findingsHint}</p>
                </>
              )}
              {showFindings && !pc.findings.features.length && <p className="c-hint">{e.findingsNone}</p>}
              {!onCaseStack && toCase && (
                <p className="c-hint">
                  {e.otherStack} <Link href={toCase}>{e.openCaseStack}</Link>
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
          <p className="c-label">{overlay ? e.shownUnder : e.shown}</p>
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
              {overlay ? e.legendProcessed : e.legendRgb}
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
