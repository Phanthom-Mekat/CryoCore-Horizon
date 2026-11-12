// Translation guard (F15): components on this list read every visible string from src/lib/i18n/messages.ts, so the
// Bangla switch changes all of their text. Translate a component, then add it here; the test names any English left.
// English kept on purpose (technical details, source citations, proper names) goes inside an element marked
// lang="en" translate="no". Plain lang="en" only labels the language, so untranslated UI marked that way still fails.
//
// Not listed yet: English added with the processed case (13 Nov 2026) in MapKey, Timeline,
// ExploreView, CompareView, EvidenceView, AboutView (Data preparation) and ProcessedView (share, area selection),
// and the new FindingPanel, PrepStatus, AreaInspector and ProcessedBrief. Each goes on the list once translated.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { findHardcodedText } from "./support/hardcoded-text.mjs";

const TRANSLATED = [
  "src/components/LanguageToggle.tsx",
  "src/components/chattogram/CaseBar.tsx",
  "src/components/chattogram/CaseGate.tsx",
  "src/components/chattogram/CaseMap.tsx",
  "src/components/chattogram/CaseSourceToggle.tsx",
  "src/components/chattogram/PixelInspector.tsx",
  "src/components/chattogram/RainCard.tsx",
  "src/components/chattogram/RainChart.tsx",
  "src/components/chattogram/views/OverviewView.tsx",
];

for (const path of TRANSLATED) {
  test(`${path} shows no hard-coded English`, () => {
    const found = findHardcodedText(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"));
    assert.deepEqual(
      found.map((f) => `line ${f.line}: ${f.text}`),
      [],
      `${path} has English that doesn't come from the messages. Move it to messages.ts (en + bn), or put it inside lang="en" translate="no" if it must stay English.`,
    );
  });
}
