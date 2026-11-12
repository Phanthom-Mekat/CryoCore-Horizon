"use client";

import { Languages } from "lucide-react";
import { LANGS, setLang } from "@/lib/i18n/locale";
import { useLang, useT } from "@/lib/i18n/useT";

/** EN | বাংলা switch (plan F15). The choice is remembered in this browser and applied before the next page paints. */
export function LanguageToggle() {
  const lang = useLang();
  const t = useT();
  return (
    <div className="lang-toggle" role="group" aria-label={t.language}>
      <Languages size={16} aria-hidden="true" />
      {LANGS.map((l) => (
        <button key={l.id} type="button" lang={l.htmlLang} aria-pressed={lang === l.id} onClick={() => lang !== l.id && setLang(l.id)}>
          {l.label}
        </button>
      ))}
    </div>
  );
}
