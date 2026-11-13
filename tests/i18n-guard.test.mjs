// Translation guard (F15): components on this list read every visible string from src/lib/i18n/messages.ts, so the
// Bangla switch changes all of their text. Translate a component, then add it here; the test names any English left.
// English kept on purpose (technical details, source citations, proper names) goes inside an element marked
// lang="en" translate="no". Plain lang="en" only labels the language, so untranslated UI marked that way still fails.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { findHardcodedText } from "./support/hardcoded-text.mjs";

const TRANSLATED = [
  "src/components/LanguageToggle.tsx",
  "src/components/chattogram/CaseBar.tsx",
  "src/components/chattogram/CaseGate.tsx",
  "src/components/chattogram/CaseMap.tsx",
  "src/components/chattogram/CaseProvider.tsx",
  "src/components/chattogram/AreaInspector.tsx",
  "src/components/chattogram/CaseSourceToggle.tsx",
  "src/components/chattogram/FindingChart.tsx",
  "src/components/chattogram/FindingPanel.tsx",
  "src/components/chattogram/MapKey.tsx",
  "src/components/chattogram/PlainAnswer.tsx",
  "src/components/chattogram/PixelInspector.tsx",
  "src/components/chattogram/PrepStatus.tsx",
  "src/components/chattogram/ProcessedBrief.tsx",
  "src/components/chattogram/RainCard.tsx",
  "src/components/chattogram/RainChart.tsx",
  "src/components/chattogram/Timeline.tsx",
  "src/components/chattogram/views/AboutView.tsx",
  "src/components/chattogram/views/CompareView.tsx",
  "src/components/chattogram/views/EvidenceView.tsx",
  "src/components/chattogram/views/ExploreView.tsx",
  "src/components/chattogram/views/OverviewView.tsx",
  "src/components/chattogram/views/ProcessedView.tsx",
  "src/components/chattogram/views/TourView.tsx",
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
