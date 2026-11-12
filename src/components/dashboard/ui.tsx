import Link from "next/link";
import { ChevronRight, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/** Breadcrumb trail plus page actions, as at the top of the Scene catalogue. */
export function PageHead({ crumbs, actions, root = { href: "/chattogram", label: "Chattogram" } }: { crumbs: string[]; actions?: ReactNode; root?: { href: string; label: string } }) {
  return (
    <div className="d-head">
      <nav aria-label="Breadcrumb">
        <ol className="d-crumbs">
          <li>
            <Link href={root.href}>{root.label}</Link>
          </li>
          {crumbs.map((c, i) => (
            <li key={c} aria-current={i === crumbs.length - 1 ? "page" : undefined}>
              <ChevronRight size={14} aria-hidden="true" />
              {c}
            </li>
          ))}
        </ol>
      </nav>
      {actions && <div className="d-actions">{actions}</div>}
    </div>
  );
}

export function KpiStrip({ children, label }: { children: ReactNode; label: string }) {
  return (
    <section className="d-kpis" aria-label={label}>
      {children}
    </section>
  );
}

export function Kpi({ label, value, unit, sub, icon: Icon, tone }: { label: string; value: string; unit?: string; sub?: ReactNode; icon: LucideIcon; tone?: "up" | "down" }) {
  return (
    <div className="d-kpi">
      <div>
        <span className="d-kpi-label">{label}</span>
        <strong>
          {value}
          {unit && <em>{unit}</em>}
        </strong>
        {sub && <span className={`d-kpi-sub${tone ? ` is-${tone}` : ""}`}>{sub}</span>}
      </div>
      <Icon size={22} aria-hidden="true" className="d-kpi-icon" />
    </div>
  );
}
