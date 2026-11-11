"use client";

import { useCallback } from "react";
import { ExternalLink, FileText } from "lucide-react";
import { covers, fmtDate, fmtSize, fmtTime, type Acquisition } from "@/lib/chattogram/acquisitions";
import { CaseMap } from "../CaseMap";
import { FOCUS, useCase } from "../CaseProvider";
import { Timeline } from "../Timeline";

export function ExploreView() {
  const { load, stack, before, after, view, pick, set } = useCase();
  const onMove = useCallback((v: typeof view) => set({ view: v }), [set]);
  const onPick = useCallback((a: Acquisition) => set({ pick: a.conceptId }), [set]);
  if (load.status !== "ready" || !stack) return null;

  const shown = stack.items.find((a) => a.conceptId === pick) ?? after ?? stack.items[0];
  const overFocus = load.data.stacks.filter((s) => covers(s.items[0], FOCUS.lonLat));
  const marks: Record<string, string> = {};
  if (before) marks[before.conceptId] = "Before";
  if (after) marks[after.conceptId] = "After";

  return (
    <div className="c-explore">
      <section className="c-stage" aria-label="Map">
        <CaseMap
          label={`Map of ${FOCUS.name} with the NISAR quicklook of ${fmtDate(shown.start)}`}
          view={view}
          onMove={onMove}
          image={shown}
          footprints={stack.items}
          selected={shown.conceptId}
          onPick={(id) => id && set({ pick: id })}
          envelope={load.data.region.bbox}
        />
        <Timeline items={stack.items} current={shown.conceptId} onPick={onPick} marks={marks} />
      </section>

      <aside className="c-panel" aria-label="Acquisition details">
        <div className="c-panel-block">
          <label className="c-label" htmlFor="stack">
            Radar stack
          </label>
          <select id="stack" className="c-select" value={stack.id} onChange={(e) => set({ stack: e.target.value })}>
            {overFocus.map((s) => (
              <option key={s.id} value={s.id}>
                Track {s.items[0].track} · frame {s.items[0].frame} · {s.items[0].direction.toLowerCase()} · {s.items.length} dates
              </option>
            ))}
          </select>
          <p className="c-hint">Stacks share one orbit track, frame and direction, so their images are comparable. Listed: those covering {FOCUS.name}.</p>
        </div>

        <div className="c-panel-block">
          <p className="c-label">Shown on the map</p>
          <h2 className="c-acq-date">{fmtDate(shown.start)}</h2>
          <dl className="c-facts">
            <div>
              <dt>Time</dt>
              <dd>{fmtTime(shown.start)}</dd>
            </div>
            <div>
              <dt>Polarizations</dt>
              <dd>{shown.polarizations.join(" + ") || "–"}</dd>
            </div>
            <div>
              <dt>Frequencies</dt>
              <dd>{shown.frequencies.length ? shown.frequencies.map((f) => (f === "A" ? "L-band A" : f === "B" ? "L-band B" : f)).join(", ") : "–"}</dd>
            </div>
            <div>
              <dt>Orbit</dt>
              <dd>{shown.orbit ?? "–"}</dd>
            </div>
            <div>
              <dt>Product</dt>
              <dd>GCOV v{shown.version ?? "?"}</dd>
            </div>
            <div>
              <dt>Data maturity</dt>
              <dd className={shown.maturity ? "is-warn" : undefined}>{shown.maturity ?? "Not labelled beta/provisional"}</dd>
            </div>
            <div>
              <dt>File</dt>
              <dd>{fmtSize(shown.sizeBytes)} HDF5</dd>
            </div>
          </dl>
          <div className="c-links">
            {shown.qaReport && (
              <a className="c-btn" href={shown.qaReport} target="_blank" rel="noreferrer">
                <FileText size={15} aria-hidden="true" />
                NASA QA report
              </a>
            )}
            {shown.dataUrl && (
              <a className="c-btn" href={shown.dataUrl} target="_blank" rel="noreferrer" title="Needs a free NASA Earthdata login">
                <ExternalLink size={15} aria-hidden="true" />
                HDF5 file (Earthdata login)
              </a>
            )}
          </div>
        </div>

        <div className="c-panel-block">
          <p className="c-label">Legend</p>
          <ul className="c-legend">
            <li>
              <i className="c-key c-key-rgb" aria-hidden="true" />
              NISAR browse quicklook, colour composite of polarizations. For looking, not measuring.
            </li>
            <li>
              <i className="c-key c-key-foot" aria-hidden="true" />
              Footprint of each date in this stack; the bright one is shown.
            </li>
            <li>
              <i className="c-key c-key-env" aria-hidden="true" />
              Search envelope. Not the division boundary.
            </li>
          </ul>
        </div>
      </aside>
    </div>
  );
}
