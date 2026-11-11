"use client";

import { useRouter } from "next/navigation";
import { ArrowRight, Bell, MoveRight, TrendingDown, TrendingUp, Trophy, type LucideIcon } from "lucide-react";
import { useDashboard } from "../DashboardProvider";
import { Card, PageHead } from "../ui";
import { ALERT_RULES, fmtDay, type Alert } from "@/lib/dashboard-data";

const KIND: Record<Alert["kind"], { icon: LucideIcon; label: string }> = {
  "speed-up": { icon: TrendingUp, label: "Speed-up" },
  "slow-down": { icon: TrendingDown, label: "Slow-down" },
  retreat: { icon: MoveRight, label: "Front retreat" },
  peak: { icon: Trophy, label: "Record" },
};

export function AlertsView() {
  const { alerts, setPairIdx } = useDashboard();
  const router = useRouter();

  return (
    <>
      <PageHead crumbs={["Alerts"]} />
      <Card
        title="Alerts from the data"
        icon={Bell}
        sub={`Raised when front speed changes by ${ALERT_RULES.speedJumpPct}% or more between pairs, or the front retreats ${ALERT_RULES.retreatKm} km or more between passes.`}
      >
        {alerts.length === 0 ? (
          <p className="d-empty">Nothing unusual in this record. Alerts appear here when the glacier speeds up, slows down or retreats sharply.</p>
        ) : (
          <ul className="d-alerts">
            {alerts.map((a) => {
              const { icon: Icon, label } = KIND[a.kind];
              return (
                <li key={a.id} className={`is-${a.kind}`}>
                  <Icon size={20} aria-hidden="true" />
                  <div>
                    <p className="d-alert-meta">
                      <span>{label}</span> {fmtDay(a.date)}
                    </p>
                    <p className="d-alert-title">{a.title}</p>
                    <p className="d-alert-detail">{a.detail}</p>
                  </div>
                  <button
                    type="button"
                    className="d-btn"
                    onClick={() => {
                      setPairIdx(a.pairIndex);
                      router.push("/dashboard/speed");
                    }}
                  >
                    View on the map
                    <ArrowRight size={15} aria-hidden="true" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}
