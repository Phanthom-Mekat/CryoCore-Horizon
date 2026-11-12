"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { History, Layers, RotateCw } from "lucide-react";
import { useLang, useT } from "@/lib/i18n/useT";
import { switchCaseSource } from "@/lib/chattogram/sourceStore";
import { useCase, type CaseSource } from "./CaseProvider";

/** Loading and failure states for every case page. The catalogue still opens with no scenes stored: that is where they are fetched. */
export function CaseGate({ children }: { children: ReactNode }) {
  const { load, reload, source } = useCase();
  const t = useT();
  const path = usePathname();
  // the calibrated pages don't need the catalogue, but they do need to know whether this is a replay
  if (path === "/chattogram/processed" || path.startsWith("/chattogram/processed/"))
    return (
      <>
        {source.mode === "frozen" && <FrozenNotice source={source} />}
        {children}
      </>
    );
  if (load.status === "ready" || (load.status === "empty" && path === "/chattogram/catalogue"))
    return (
      <>
        {source.mode === "frozen" && <FrozenNotice source={source} />}
        {children}
      </>
    );
  if (load.status === "loading")
    return (
      <div className="d-state d-loading" aria-busy="true">
        <span className="d-spinner" aria-hidden="true" />
        <p>{t.gate.loading}</p>
      </div>
    );
  const title = load.status === "empty" ? t.gate.emptyTitle : load.status === "unavailable" ? t.gate.unavailableTitle : t.gate.failedTitle;
  return (
    <div className="d-state" role="alert">
      <h2>{title}</h2>
      {load.status === "empty" ? (
        <p>{t.gate.emptyBody}</p>
      ) : (
        // the technical detail is for whoever runs the servers, so it stays as the service reported it
        <p className="c-state-detail" lang="en">
          {load.reason}
        </p>
      )}
      <div className="c-state-actions">
        {load.status === "empty" ? (
          <Link className="d-btn is-primary" href="/chattogram/catalogue">
            <Layers size={16} aria-hidden="true" />
            {t.gate.openCatalogue}
          </Link>
        ) : (
          <button type="button" className="d-btn is-primary" onClick={reload}>
            <RotateCw size={16} aria-hidden="true" />
            {t.gate.tryAgain}
          </button>
        )}
      </div>
    </div>
  );
}

/** Shown on every case page while the frozen case is replayed, so a snapshot is never mistaken for live data. */
function FrozenNotice({ source }: { source: CaseSource }) {
  const t = useT();
  const lang = useLang();
  const when = source.frozenAt
    ? new Date(source.frozenAt).toLocaleString(lang === "bn" ? "bn-BD" : "en-GB", {
        day: "numeric",
        month: lang === "bn" ? "long" : "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: "UTC",
      }) + " UTC"
    : "–";
  const { reload } = useCase();
  // chosen replay: switch the source (no reload); fallback because the backend was down: just ask the backend again
  const live = () => (source.fallback ? reload() : switchCaseSource("live"));
  return (
    <p className="c-frozen" role="status">
      <History size={16} aria-hidden="true" />
      <span>
        <strong>{t.frozen.title(when)}</strong> {source.fallback ? t.frozen.fallback : t.frozen.chosen} {t.frozen.body}
      </span>
      <button type="button" className="c-frozen-live" onClick={live}>
        {source.fallback ? t.frozen.tryLive : t.frozen.switchLive}
      </button>
    </p>
  );
}
