import Link from "next/link";
import { ChevronRight, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/** Breadcrumb trail plus page actions, as in the top of every dashboard page. */
export function PageHead({ crumbs, actions }: { crumbs: string[]; actions?: ReactNode }) {
  return (
    <div className="d-head">
      <nav aria-label="Breadcrumb">
        <ol className="d-crumbs">
          <li>
            <Link href="/dashboard">Jakobshavn</Link>
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

export function Card({
  title,
  icon: Icon,
  sub,
  actions,
  className = "",
  children,
}: {
  title: string;
  icon?: LucideIcon;
  sub?: ReactNode;
  actions?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  const id = `c-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return (
    <section className={`d-card ${className}`} aria-labelledby={id}>
      <div className="d-card-head">
        <div>
          <h2 id={id}>
            {Icon && <Icon size={18} aria-hidden="true" />}
            {title}
          </h2>
          {sub && <p>{sub}</p>}
        </div>
        {actions}
      </div>
      {children}
    </section>
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

export function Toggle({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <label className="d-toggle">
      <span>
        {label}
        {hint && <small>{hint}</small>}
      </span>
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

/** A labelled 0–100% bar. `tone` colours it only when the value needs attention. */
export function Meter({ label, value, display, tone = "ok", note }: { label: string; value: number; display: string; tone?: "ok" | "warn"; note?: string }) {
  return (
    <div className={`d-meter is-${tone}`}>
      <div className="d-meter-row">
        <span>{label}</span>
        <strong>{display}</strong>
      </div>
      <div className="d-meter-bar" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value * 100)} aria-valuetext={display}>
        <i style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} />
      </div>
      {note && <small>{note}</small>}
    </div>
  );
}
