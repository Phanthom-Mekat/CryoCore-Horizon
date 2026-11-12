"use client";

import type { ReactNode } from "react";
import { fmtDate, fmtNum } from "@/lib/i18n/format";
import { useT } from "@/lib/i18n/useT";
import { useCase } from "./CaseProvider";

/** Case name, radar geometry, dates and source, above every map view (plan F-B), with page actions on the right. */
export function CaseBar({ title, actions }: { title: string; actions?: ReactNode }) {
  const { stack, before, after } = useCase();
  const t = useT();
  const g = stack?.items[0];
  return (
    <div className="c-bar">
      <div className="c-bar-text">
        <p className="c-eyebrow">{t.bar.eyebrow}</p>
        <h1>{title}</h1>
        {g && before && after && (
          <p className="c-bar-meta">
            {t.bar.meta(g.track === null ? "–" : fmtNum(g.track), g.frame === null ? "–" : fmtNum(g.frame), t.direction[g.direction], fmtDate(before.start), fmtDate(after.start))}
          </p>
        )}
      </div>
      {actions && <div className="c-bar-actions">{actions}</div>}
    </div>
  );
}
