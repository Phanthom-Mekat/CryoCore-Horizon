"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { BrandMark } from "./BrandMark";
import { ThemeToggle } from "./ThemeToggle";

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
        <BrandMark />
        CryoCore Horizon
      </a>
      <nav aria-label="Sections">
        {SECTIONS.map((s) => (
          <a key={s.id} href={`#${s.id}`} aria-current={active === s.id ? "location" : undefined}>
            {s.label}
          </a>
        ))}
      </nav>
      <ThemeToggle />
      <Link href="/dashboard" className="nav-link-plain">
        Glacier sample
      </Link>
      <Link href="/chattogram" className="nav-cta">
        Chattogram case study
      </Link>
    </header>
  );
}
