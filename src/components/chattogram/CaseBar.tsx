"use client";

import type { ReactNode } from "react";
import { fmtDate } from "@/lib/chattogram/acquisitions";
import { useCase } from "./CaseProvider";

/** Case name, radar geometry, dates and source, above every map view (plan F-B), with page actions on the right. */
export function CaseBar({ title, actions }: { title: string; actions?: ReactNode }) {
  const { stack, before, after } = useCase();
  const g = stack?.items[0];
  return (
    <div className="c-bar">
      <div className="c-bar-text">
        <p className="c-eyebrow">Chattogram · NASA–ISRO NISAR</p>
        <h1>{title}</h1>
        {g && before && after && (
          <p className="c-bar-meta">
            Track {g.track} · frame {g.frame} · {g.direction.toLowerCase()} · {fmtDate(before.start)} → {fmtDate(after.start)} · NASA Earthdata / ASF
          </p>
        )}
      </div>
      {actions && <div className="c-bar-actions">{actions}</div>}
    </div>
  );
}
