"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";

const SECTIONS = [
  { id: "dark", label: "Why radar" },
  { id: "radar", label: "How it works" },
  { id: "glacier", label: "The glacier" },
  { id: "team", label: "Team" },
] as const;

const subscribeScroll = (cb: () => void) => {
  window.addEventListener("scroll", cb, { passive: true });
  return () => window.removeEventListener("scroll", cb);
};
const getScrolled = () => window.scrollY > 48;
const getServerScrolled = () => false;

/** Fixed mission-header navigation with scrolled frosted glass and active-section tracking. */
export function SiteNav() {
  const scrolled = useSyncExternalStore(subscribeScroll, getScrolled, getServerScrolled);
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    const visible = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.add(entry.target.id);
          else visible.delete(entry.target.id);
        }
        setActive(SECTIONS.find((s) => visible.has(s.id))?.id ?? null);
      },
      { rootMargin: "-18% 0px -52% 0px", threshold: 0 }
    );
    for (const { id } of SECTIONS) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, []);

  return (
    <header className="nav" data-scrolled={scrolled ? "true" : undefined}>
      <a className="brand" href="#top" aria-label="CryoCore Horizon, back to top">
        <svg viewBox="0 0 32 32" width="26" height="26" aria-hidden="true">
          <circle cx="16" cy="16" r="13" fill="none" stroke="currentColor" strokeWidth="1.5" opacity=".35" />
          <path d="M5.5 20.5h21" stroke="currentColor" strokeWidth="1.5" />
          <path d="M16 20.5 9 9.5" stroke="var(--ice)" strokeWidth="1.5" />
          <path d="M16 20.5l-4.2-6.6a8 8 0 0 1 8.4 0z" fill="var(--ice)" opacity=".35" />
        </svg>
        CryoCore Horizon
      </a>
      <nav aria-label="Sections">
        {SECTIONS.map((s) => (
          <a key={s.id} href={`#${s.id}`} aria-current={active === s.id ? "location" : undefined}>
            {s.label}
          </a>
        ))}
      </nav>
      <Link href="/dashboard" className="nav-cta">
        Dashboard
      </Link>
    </header>
  );
}
