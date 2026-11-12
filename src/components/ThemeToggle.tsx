"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";

const KEY = "cryocore-theme";
type Theme = "light" | "dark";
function apply(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#04080f" : "#ffffff");
  window.dispatchEvent(new Event("cryocore-theme-change"));
}
function subscribe(notify: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === KEY || event.key === null) apply(event.newValue === "dark" ? "dark" : "light");
  };
  window.addEventListener("cryocore-theme-change", notify);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener("cryocore-theme-change", notify);
    window.removeEventListener("storage", onStorage);
  };
}
const snapshot = (): Theme => document.documentElement.dataset.theme === "dark" ? "dark" : "light";
const serverSnapshot = (): Theme => "light";

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  return (
    <button
      type="button"
      className="theme-toggle"
      aria-label="Dark mode"
      aria-pressed={theme === "dark"}
      title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
      onClick={() => {
        const next = theme === "dark" ? "light" : "dark";
        apply(next);
        try { localStorage.setItem(KEY, next); } catch { /* The switch still works when storage is unavailable. */ }
      }}
    >
      {theme === "dark" ? <Moon size={17} aria-hidden="true" /> : <Sun size={17} aria-hidden="true" />}
      <span>{theme === "dark" ? "Dark" : "Light"}</span>
    </button>
  );
}
