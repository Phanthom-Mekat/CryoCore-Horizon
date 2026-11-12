// Dates and numbers in the interface language: English (en-GB) or Bangla (bn-BD, with Bengali digits and month names).
// Times stay in UTC, as NASA records them. Components that call these also call useT(), so they re-render on a switch.
import { currentLang } from "./locale";

const loc = () => (currentLang() === "bn" ? "bn-BD" : "en-GB");
const month = () => (currentLang() === "bn" ? "long" : "short");

export const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(loc(), { day: "numeric", month: month(), year: "numeric", timeZone: "UTC" });
export const fmtDayMonth = (iso: string) => new Date(iso).toLocaleDateString(loc(), { day: "numeric", month: month(), timeZone: "UTC" });
export const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString(loc(), { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" }) + " UTC";
export const fmtDateTime = (iso: string) => `${fmtDate(iso)}, ${fmtTime(iso)}`;
/** Whole numbers, or `digits` decimals, with a typographic minus (−). Track, frame and orbit numbers go through this too. */
export const fmtNum = (n: number, digits?: number) =>
  n
    .toLocaleString(loc(), digits === undefined ? { useGrouping: false } : { minimumFractionDigits: digits, maximumFractionDigits: digits, useGrouping: false })
    .replace("-", "−");
/** Like fmtNum, with a leading + on positive values (signed dB change). */
export const fmtSigned = (n: number, digits = 2) => `${n > 0 ? "+" : ""}${fmtNum(n, digits)}`;
/** An area in km², without the unit: two decimals below 10 km² and one above, so 4.91 and 175.7 both read naturally. */
export const fmtArea = (km2: number) => fmtNum(km2, km2 < 10 ? 2 : 1);
export const fmtSize = (b: number | null) => (b === null ? "–" : b > 1e9 ? `${fmtNum(b / 1e9, 1)} GB` : `${fmtNum(Math.round(b / 1e6))} MB`);
