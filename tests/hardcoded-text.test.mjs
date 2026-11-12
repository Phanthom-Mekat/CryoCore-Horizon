import { test } from "node:test";
import assert from "node:assert/strict";
import { findHardcodedText } from "./support/hardcoded-text.mjs";

const texts = (src) => findHardcodedText(src).map((f) => f.text);

test("flags English written between tags, with its line", () => {
  const src = `export function A() {\n  return <p>Processed case</p>;\n}\n`;
  assert.deepEqual(findHardcodedText(src), [{ line: 2, text: "Processed case" }]);
});

test("ignores published technical names, symbols and Bangla", () => {
  const src = `const A = () => (
    <p>
      {t.title} · NISAR GCOV HH/HV, dB, km², γ⁰, SHA-256 (JSON / CSV / GeoJSON) – UTC
      <span>বৃষ্টিপাত</span> <b>12.5</b> → %
    </p>
  );`;
  assert.deepEqual(texts(src), []);
});

test("flags strings shown through {…}, in every branch", () => {
  const src = `const A = () => (
    <div>
      <p>{m ? "Measured from GCOV" : "Not processed yet"}</p>
      <h2>{detail?.title ?? "Karnaphuli estuary"}</h2>
      <span>{\`\${n} findings listed\`}</span>
      <i>{ok && "Ready"}</i>
      <b>{fmt(x, "en-GB")} {cls("is-on")}</b>
    </div>
  );`;
  assert.deepEqual(texts(src), ["Measured from GCOV", "Not processed yet", "Karnaphuli estuary", "findings listed", "Ready"]);
});

test("flags user-facing attributes but not code attributes", () => {
  const src = `const A = () => (
    <section className="c-processed is-ready" id="processed-h" role="region" data-state="ready here">
      <dl aria-label={\`Processed case in numbers, \${span}\`} />
      <button title="Copy the link" type="button" />
      <input placeholder={busy ? "Waiting for data" : t.search} />
      <img alt="Radar quicklook" src="/img/a.webp" />
      <a href="/chattogram/about" target="_blank" rel="noreferrer">{t.about}</a>
    </section>
  );`;
  assert.deepEqual(texts(src), ["Processed case in numbers,", "Copy the link", "Waiting for data", "Radar quicklook"]);
});

test('skips English kept on purpose (lang="en" translate="no"), but not English that is only labelled', () => {
  const src = `const A = () => (
    <div>
      <p className="c-rain-source" lang="en" translate="no">
        {r.sourceLead} {rain.provider} from {rain.sources.join(" + ")}; retrieved <b>{when}</b>.
      </p>
      <p lang="en" translate="no" title="Technical detail">{ok ? "as the service reported it" : reason}</p>
      <button lang="en">Share radar view</button>
      <p>Outside the marked element</p>
    </div>
  );`;
  assert.deepEqual(texts(src), ["Share radar view", "Outside the marked element"]);
});

test("flags strings joined with +", () => {
  const src = `const A = () => <p>{"Valid " + n + " pixels"} {n + "%"} {fmt(a + "x")}</p>;`;
  assert.deepEqual(texts(src), ["Valid", "pixels"]);
});
