"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { ArrowLeft, Columns2, FileSearch, Home, Info, Layers, Map, Menu, PlayCircle, Radar, X, type LucideIcon } from "lucide-react";
import { BrandMark } from "@/components/BrandMark";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LanguageToggle } from "@/components/LanguageToggle";
import { CaseSourceToggle } from "@/components/chattogram/CaseSourceToggle";
import { useT } from "@/lib/i18n/useT";
import type { Messages } from "@/lib/i18n/messages";

type NavKey = keyof Messages["nav"];
type Item = { href: string; label: NavKey; icon: LucideIcon };
type Group = { group: NavKey; tag?: { label: NavKey; tone: "live" }; items: Item[] };
// labels are message keys (src/lib/i18n/messages.ts), so the sidebar follows the interface language
const NAV: Group[] = [
  {
    group: "caseGroup",
    tag: { label: "realData", tone: "live" },
    items: [
      { href: "/chattogram", label: "overview", icon: Home },
      { href: "/chattogram/tour", label: "tour", icon: PlayCircle },
      { href: "/chattogram/explore", label: "explore", icon: Map },
      { href: "/chattogram/compare", label: "compare", icon: Columns2 },
      { href: "/chattogram/processed", label: "processed", icon: Radar },
      { href: "/chattogram/evidence", label: "evidence", icon: FileSearch },
      { href: "/chattogram/catalogue", label: "catalogue", icon: Layers },
      { href: "/chattogram/about", label: "about", icon: Info },
    ],
  },
];
const TITLES: Record<string, NavKey> = Object.fromEntries(NAV.flatMap((g) => g.items.map((i) => [i.href, i.label])));

export function Shell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const t = useT();
  const nav = t.nav;
  const [open, setOpen] = useState(false);

  // close the phone menu after navigating
  const [lastPath, setLastPath] = useState(path);
  if (path !== lastPath) {
    setLastPath(path);
    setOpen(false);
  }
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="d-shell">
      <a className="skip" href="#d-main">
        {nav.skip}
      </a>
      <aside className={`d-side${open ? " is-open" : ""}`} aria-label={nav.caseGroup}>
        <div className="d-brand">
          <BrandMark size={22} />
          CryoCore Horizon
          <button type="button" className="d-icon-btn d-close" onClick={() => setOpen(false)} aria-label={nav.closeMenu}>
            <X size={18} />
          </button>
        </div>
        <nav className="d-nav">
          {NAV.map((g) => (
            <div key={g.group}>
              <p className="d-nav-group">
                {nav[g.group]}
                {g.tag && <span className={`d-nav-tag is-${g.tag.tone}`}>{nav[g.tag.label]}</span>}
              </p>
              <ul>
                {g.items.map(({ href, label, icon: Icon }) => (
                  <li key={href}>
                    <Link
                      href={href}
                      aria-current={path === href ? "page" : undefined}
                      onClick={(e) => {
                        // moving within the case keeps the chosen stack, dates and map view (they live in the query)
                        if (window.location.search && !e.metaKey && !e.ctrlKey) {
                          e.preventDefault();
                          router.push(href + window.location.search);
                        }
                      }}
                    >
                      <Icon size={17} aria-hidden="true" />
                      {nav[label]}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
        <div className="d-side-foot">
          <p className="d-status is-live">
            <i aria-hidden="true" />
            {nav.caseStatus}
          </p>
          <Link href="/" className="d-back">
            <ArrowLeft size={16} aria-hidden="true" />
            {nav.back}
          </Link>
        </div>
      </aside>
      {open && <div className="d-scrim" onClick={() => setOpen(false)} aria-hidden="true" />}

      <div className="d-main">
        <header className="d-top">
          <button type="button" className="d-icon-btn d-menu" onClick={() => setOpen(true)} aria-label={nav.openMenu} aria-expanded={open}>
            <Menu size={20} />
          </button>
          <p className="d-title">{TITLES[path] ? nav[TITLES[path]] : nav.dashboard}</p>
          <CaseSourceToggle />
          <LanguageToggle />
          <ThemeToggle />
          <span className="d-avatar" title="Team CryoCore Horizon" aria-hidden="true">
            CH
          </span>
        </header>
        <main id="d-main" className="d-body is-case">
          {children}
        </main>
      </div>
    </div>
  );
}
