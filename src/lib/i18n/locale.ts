// The interface language (plan F15). Stored like the theme: in localStorage, applied to <html lang> by an inline script in
// the root layout before the page paints, so screen readers and Bengali fonts switch with it. Plain module: Node can
// import it (it only touches `document` when one exists), so formatting falls back to English in scripts.
export type Lang = "en" | "bn";
export const LANGS: { id: Lang; label: string; htmlLang: string }[] = [
  { id: "en", label: "EN", htmlLang: "en" },
  { id: "bn", label: "বাংলা", htmlLang: "bn" },
];
export const LANG_KEY = "cryocore-lang";
const EVENT = "cryocore-lang-change";

export const currentLang = (): Lang => (typeof document !== "undefined" && document.documentElement.lang === "bn" ? "bn" : "en");

export function setLang(lang: Lang) {
  document.documentElement.lang = lang;
  try {
    localStorage.setItem(LANG_KEY, lang);
  } catch {
    /* the switch still works for this visit when storage is unavailable */
  }
  window.dispatchEvent(new Event(EVENT));
}

export function subscribeLang(notify: () => void) {
  const onStorage = (e: StorageEvent) => {
    if (e.key !== LANG_KEY && e.key !== null) return;
    document.documentElement.lang = e.newValue === "bn" ? "bn" : "en"; // another tab switched
    notify();
  };
  window.addEventListener(EVENT, notify);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(EVENT, notify);
    window.removeEventListener("storage", onStorage);
  };
}

/** Runs before first paint (root layout): applies the saved language so nothing flickers from English to Bangla. */
export const LANG_BOOT_SCRIPT = `try{document.documentElement.lang=localStorage.getItem("${LANG_KEY}")==="bn"?"bn":"en"}catch{}`;
