"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { History, Layers, RotateCw } from "lucide-react";
import { useCase, type CaseSource } from "./CaseProvider";

/** Loading and failure states for every case page. The catalogue still opens with no scenes stored: that is where they are fetched. */
export function CaseGate({ children }: { children: ReactNode }) {
  const { load, reload, source } = useCase();
  const path = usePathname();
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
        <p>Loading NISAR acquisitions over Chattogram…</p>
      </div>
    );
  return (
    <div className="d-state" role="alert">
      <h2>{load.status === "empty" ? "No NISAR scenes stored yet" : load.status === "unavailable" ? "The data service isn’t running" : "The data service returned an error"}</h2>
      <p>{load.reason}</p>
      <div className="c-state-actions">
        {load.status === "empty" ? (
          <Link className="d-btn is-primary" href="/chattogram/catalogue">
            <Layers size={16} aria-hidden="true" />
            Open the scene catalogue
          </Link>
        ) : (
          <button type="button" className="d-btn is-primary" onClick={reload}>
            <RotateCw size={16} aria-hidden="true" />
            Try again
          </button>
        )}
      </div>
    </div>
  );
}

/** Shown on every case page while the frozen case is replayed, so a snapshot is never mistaken for live data. */
function FrozenNotice({ source }: { source: CaseSource }) {
  const when = source.frozenAt
    ? new Date(source.frozenAt).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }) + " UTC"
    : "an earlier date";
  const live = () => {
    const q = new URLSearchParams(window.location.search);
    q.delete("source");
    window.location.search = q.toString(); // a full reload asks the backend again
  };
  return (
    <p className="c-frozen" role="status">
      <History size={16} aria-hidden="true" />
      <span>
        <strong>Frozen case, captured {when}.</strong>{" "}
        {source.fallback ? "The live data service isn’t reachable, so this is the saved snapshot." : "Replaying the saved snapshot."} Scenes, dates and radar
        images are exactly as NASA published them then; nothing here is fetched live.
      </span>
      <button type="button" className="c-frozen-live" onClick={live}>
        {source.fallback ? "Try live data" : "Switch to live data"}
      </button>
    </p>
  );
}
