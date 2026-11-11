// Display settings shared by every dashboard page; persisted per browser (localStorage is a convenience only).
import { useSyncExternalStore } from "react";
import type { SpeedUnit } from "./dashboard-data";

export type Settings = {
  units: SpeedUnit;
  smooth: boolean;
  layers: { speed: boolean; fronts: boolean; probes: boolean };
};
const KEY = "cryocore-dashboard-settings";
const DEFAULTS: Settings = { units: "mday", smooth: false, layers: { speed: true, fronts: true, probes: true } };

let current: Settings | null = null;
const listeners = new Set<() => void>();

function read(): Settings {
  if (current) return current;
  try {
    current = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || "{}") };
  } catch {
    current = DEFAULTS;
  }
  return current!;
}

export function setSettings(patch: Partial<Settings>) {
  current = { ...read(), ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* private mode: settings last for this visit only */
  }
  listeners.forEach((l) => l());
}

export function useSettings() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    read,
    () => DEFAULTS,
  );
}
