"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { ArrowLeft, Bell, BookOpen, Columns2, Compass, Gauge, LayoutDashboard, Menu, Mountain, Radar, Satellite, Search, X, type LucideIcon } from "lucide-react";
import { BrandMark } from "@/components/BrandMark";
import { DataGate, useDashboardMaybe } from "./DashboardProvider";

type Item = { href: string; label: string; icon: LucideIcon };
const NAV: { group?: string; items: Item[] }[] = [
  {
    group: "Chattogram",
    items: [
      { href: "/chattogram", label: "Radar: explore & compare", icon: Columns2 },
      { href: "/explore", label: "Scene catalogue", icon: Compass },
    ],
  },
  { group: "Jakobshavn", items: [{ href: "/dashboard", label: "Overview", icon: LayoutDashboard }] },
  {
    group: "Glacier",
    items: [
      { href: "/dashboard/speed", label: "Ice speed", icon: Gauge },
      { href: "/dashboard/fronts", label: "Calving front", icon: Mountain },
      { href: "/dashboard/radar", label: "Radar images", icon: Radar },
    ],
  },
  {
    group: "Data",
    items: [
      { href: "/dashboard/passes", label: "NISAR passes", icon: Satellite },
      { href: "/dashboard/alerts", label: "Alerts", icon: Bell },
      { href: "/dashboard/methods", label: "Data and methods", icon: BookOpen },
    ],
  },
];
const TITLES: Record<string, string> = Object.fromEntries(NAV.flatMap((g) => g.items.map((i) => [i.href, i.label])));

export function Shell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const data = useDashboardMaybe();
  const isExplorer = path === "/explore";
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const alertCount = data?.alerts.filter((a) => a.kind !== "peak").length ?? 0;

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
        Skip to content
      </a>
      <aside className={`d-side${open ? " is-open" : ""}`} aria-label="Dashboard">
        <div className="d-brand">
          <BrandMark size={22} />
          CryoCore Horizon
          <button type="button" className="d-icon-btn d-close" onClick={() => setOpen(false)} aria-label="Close menu">
            <X size={18} />
          </button>
        </div>
        <nav className="d-nav">
          {NAV.map((g, gi) => (
            <div key={gi}>
              {g.group && <p className="d-nav-group">{g.group}</p>}
              <ul>
                {g.items.map(({ href, label, icon: Icon }) => (
                  <li key={href}>
                    <Link href={href} aria-current={path === href ? "page" : undefined}>
                      <Icon size={17} aria-hidden="true" />
                      {label}
                      {href === "/dashboard/alerts" && alertCount > 0 && <span className="d-badge">{alertCount}</span>}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
        <div className="d-side-foot">
          {isExplorer && <p className="d-status is-live"><i aria-hidden="true" />NASA catalog metadata</p>}
          {data && (
            <p className={`d-status ${data.manifest.sample ? "is-sample" : "is-live"}`}>
              <i aria-hidden="true" />
              {data.manifest.sample ? "Sample data" : `Real NISAR data${data.manifest.maturity ? ` · ${data.manifest.maturity}` : ""}`}
            </p>
          )}
          <Link href="/" className="d-back">
            <ArrowLeft size={16} aria-hidden="true" />
            Back to the project
          </Link>
        </div>
      </aside>
      {open && <div className="d-scrim" onClick={() => setOpen(false)} aria-hidden="true" />}

      <div className="d-main">
        <header className="d-top">
          <button type="button" className="d-icon-btn d-menu" onClick={() => setOpen(true)} aria-label="Open menu" aria-expanded={open}>
            <Menu size={20} />
          </button>
          <p className="d-title">{TITLES[path] ?? "Dashboard"}</p>
          {!isExplorer && <form
            className="d-search"
            role="search"
            onSubmit={(e) => {
              e.preventDefault();
              router.push(`/dashboard/passes${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ""}`);
            }}
          >
            <Search size={15} aria-hidden="true" />
            <input type="search" placeholder="Search passes by date" aria-label="Search NISAR passes by date" value={q} onChange={(e) => setQ(e.target.value)} />
          </form>}
          {!isExplorer && <Link href="/dashboard/alerts" className="d-icon-btn d-bell" aria-label={`Alerts, ${alertCount} active`}>
            <Bell size={18} aria-hidden="true" />
            {alertCount > 0 && <span className="d-dot" />}
          </Link>}
          <span className="d-avatar" title="Team CryoCore Horizon" aria-hidden="true">
            CH
          </span>
        </header>
        {data?.manifest.sample && (
          <p className="d-sample" role="status">
            <strong>Sample data.</strong> Speeds, fronts and radar images are synthetic placeholders in the real file format; the basemap is a real Sentinel-2 image.
            Real NISAR measurements replace them during the hackathon.
          </p>
        )}
        <main id="d-main" className="d-body">
          {/* the glacier pages wait for their data; the explorer brings its own */}
          {isExplorer ? children : <DataGate>{children}</DataGate>}
        </main>
      </div>
    </div>
  );
}
