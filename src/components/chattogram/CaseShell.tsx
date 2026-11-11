"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { BookOpen, Columns2, Compass, FileSearch, RotateCw } from "lucide-react";
import { BrandMark } from "@/components/BrandMark";
import { fmtDate } from "@/lib/chattogram/acquisitions";
import { useCase } from "./CaseProvider";

const NAV = [
  { href: "/chattogram", label: "Explore", icon: Compass },
  { href: "/chattogram/compare", label: "Compare", icon: Columns2 },
  { href: "/chattogram/evidence", label: "Evidence", icon: FileSearch },
  { href: "/chattogram/about", label: "About", icon: BookOpen },
];

export function CaseShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const { load, stack, before, after, href, reload } = useCase();

  return (
    <div className="c-shell">
      <a className="skip" href="#c-main">
        Skip to content
      </a>
      <header className="c-top">
        <Link href="/" className="c-brand" aria-label="CryoCore Horizon home">
          <BrandMark size={24} />
          <span>CryoCore Horizon</span>
        </Link>
        <div className="c-case">
          <p className="c-case-name">Chattogram, through the clouds</p>
          <p className="c-case-meta">
            {load.status === "ready" && stack && before && after ? (
              <>
                NISAR GCOV · track {stack.items[0].track}, frame {stack.items[0].frame}, {stack.items[0].direction.toLowerCase()} · {fmtDate(before.start)} → {fmtDate(after.start)} · NASA Earthdata / ASF
              </>
            ) : load.status === "loading" ? (
              "Loading NISAR acquisitions…"
            ) : (
              "NISAR GCOV · NASA Earthdata / ASF"
            )}
          </p>
        </div>
        <nav className="c-nav" aria-label="Case views">
          {NAV.map(({ href: h, label, icon: Icon }) => (
            <Link key={h} href={href(h)} aria-current={path === h ? "page" : undefined}>
              <Icon size={16} aria-hidden="true" />
              {label}
            </Link>
          ))}
        </nav>
      </header>
      <main id="c-main" className="c-main">
        {load.status === "ready" ? (
          children
        ) : load.status === "loading" ? (
          <div className="c-state" aria-busy="true">
            <span className="d-spinner" aria-hidden="true" />
            <p>Loading NISAR acquisitions over Chattogram…</p>
          </div>
        ) : (
          <div className="c-state" role="alert">
            <h2>{load.status === "empty" ? "No NISAR scenes stored yet" : load.status === "unavailable" ? "The backend isn’t running" : "The backend returned an error"}</h2>
            <p>{load.reason}</p>
            <button type="button" className="c-btn" onClick={reload}>
              <RotateCw size={15} aria-hidden="true" />
              Try again
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
