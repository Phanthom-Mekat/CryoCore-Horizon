"use client";

import { useSyncExternalStore } from "react";
import { History, Radio } from "lucide-react";
import { getCaseSource, subscribeCaseSource, switchCaseSource } from "@/lib/chattogram/sourceStore";
import { fmtDateTime, fmtDayMonth } from "@/lib/i18n/format";
import { useT } from "@/lib/i18n/useT";

/**
 * Live | Frozen switch in the header of the case pages (plan F09). Hidden when there is no choice to make: no snapshot
 * shipped with the site, or the backend is down so the snapshot is all there is (the page notice says so).
 */
export function CaseSourceToggle() {
  const source = useSyncExternalStore(subscribeCaseSource, getCaseSource, () => null);
  const t = useT();
  if (!source?.frozenAt || source.fallback) return null;
  const options = [
    { mode: "live" as const, icon: Radio, label: t.source.live, title: t.source.liveTitle },
    { mode: "frozen" as const, icon: History, label: `${t.source.frozen} · ${fmtDayMonth(source.frozenAt)}`, title: t.source.frozenTitle(fmtDateTime(source.frozenAt)) },
  ];
  return (
    <div className="lang-toggle source-toggle" role="group" aria-label={t.source.label}>
      {options.map(({ mode, icon: Icon, label, title }) => (
        <button key={mode} type="button" aria-pressed={source.mode === mode} title={title} aria-label={title} onClick={() => source.mode !== mode && switchCaseSource(mode)}>
          <Icon size={14} aria-hidden="true" />
          <span>{label}</span>
        </button>
      ))}
    </div>
  );
}
