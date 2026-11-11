"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Layers, RotateCw } from "lucide-react";
import { useCase } from "./CaseProvider";

/** Loading and failure states for every case page. The catalogue still opens with no scenes stored: that is where they are fetched. */
export function CaseGate({ children }: { children: ReactNode }) {
  const { load, reload } = useCase();
  const path = usePathname();
  if (load.status === "ready" || (load.status === "empty" && path === "/chattogram/catalogue")) return children;
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
