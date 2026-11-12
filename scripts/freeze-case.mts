// Freezes the Chattogram case for replay (IMPLEMENTATION_PLAN.md, F09): the backend's division view, every scene that
// intersects the division, and the processed NISAR quicklooks for the stacks over the city, written to
// public/data/chattogram/case/. The site then replays the case with no backend, NASA or ASF request.
// Needs the backend running (it reads the stored catalogue) and network access to ASF for the images.
// Run: pnpm freeze-case        (BACKEND_URL defaults to http://127.0.0.1:8000)
import { createHash } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { covers, stacks, toAcquisition, type Acquisition } from "../src/lib/chattogram/acquisitions.ts";
import { PROCESSING, bboxOf, browseFile, corners, decode, toWebp } from "../src/lib/chattogram/browse.ts";
import { FOCUS, FROZEN_DIR, FROZEN_VERSION, type FrozenCase, type FrozenPilot } from "../src/lib/chattogram/frozen.ts";
import { pilotOf, type ProcessedCase } from "../src/lib/chattogram/processed.ts";
import type { ExplorerData } from "../src/lib/explorer-data.ts";
import type { Scene, ScenePage } from "../src/lib/chattogram/api.ts";

const BACKEND = (process.env.BACKEND_URL || "http://127.0.0.1:8000").replace(/\/$/, "");
const out = fileURLToPath(new URL(`../public${FROZEN_DIR}`, import.meta.url));
const imgDir = `${out}img/`;

const fetchOk = async (path: string) => {
  const r = await fetch(BACKEND + path).catch(() => null);
  if (!r?.ok) throw new Error(`The backend at ${BACKEND} didn't answer ${path} (${r ? `HTTP ${r.status}` : "not reachable"}). Start it first.`);
  return r;
};
const get = async <T,>(path: string): Promise<T> => (await fetchOk(path)).json() as Promise<T>;
const sha256 = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

const explorer = await get<ExplorerData>("/api/v1/explorer");
const scenes: Scene[] = [];
for (let offset = 0; ; offset += 100) {
  const page = await get<ScenePage>(`/api/v1/scenes?product=GCOV&limit=100&offset=${offset}`);
  scenes.push(...page.scenes);
  if (scenes.length >= page.total || !page.scenes.length) break;
}

// the same selection the app makes (src/components/chattogram/CaseProvider.tsx)
const inside = new Set(explorer.scenes.features.map((f) => f.properties.id));
const acquisitions: Acquisition[] = scenes.map(toAcquisition).filter((a) => inside.has(a.conceptId) && a.footprint.length >= 3 && a.day);
const caseStacks = stacks(acquisitions.filter((a) => covers(a, FOCUS.lonLat)));
const toFreeze = caseStacks.flatMap((s) => s.items).filter((a) => a.browse);
console.log(`${scenes.length} stored scenes, ${acquisitions.length} intersect the division; freezing ${toFreeze.length} quicklooks in ${caseStacks.length} stacks over ${FOCUS.name}`);

rmSync(imgDir, { recursive: true, force: true }); // a fresh snapshot never keeps images from an older one
mkdirSync(imgDir, { recursive: true });
let bytes = 0;
const byId = new Map(acquisitions.map((a) => [a.conceptId, a]));
for (const [i, a] of toFreeze.entries()) {
  const raw = await decode(`${browseFile(a.collection, a.granule)}.png`);
  const webp = await toWebp(raw);
  const c = await corners(a.collection, a.granule, async () => raw, bboxOf(a.footprint));
  const name = `${a.granule}.webp`;
  writeFileSync(imgDir + name, webp);
  bytes += webp.byteLength;
  byId.get(a.conceptId)!.frozen = {
    src: `${FROZEN_DIR}img/${name}`,
    corners: c.corners.map(([x, y]) => [Math.round(x * 1e6) / 1e6, Math.round(y * 1e6) / 1e6]),
    cornersFrom: c.from,
    sha256: sha256(webp),
    bytes: webp.byteLength,
  };
  console.log(`${String(i + 1).padStart(2)}/${toFreeze.length} ${a.stack} ${a.day} ${(webp.byteLength / 1024).toFixed(0)} KB, corners from ${c.from}`);
}

// the calibrated pilot: its manifest, the display PNGs the map draws and the published GeoTIFFs, so the replay needs no backend
const pilotDir = `${out}pilot/`;
rmSync(pilotDir, { recursive: true, force: true });
const pilotCase = pilotOf((await get<{ cases: ProcessedCase[] }>("/api/v1/cases")).cases);
let pilot: FrozenPilot | null = null;
if (pilotCase) {
  mkdirSync(pilotDir, { recursive: true });
  const base = `/api/v1/cases/${pilotCase.id}/`;
  const files: FrozenPilot["files"] = {};
  const save = async (path: string, name: string, expected?: string) => {
    const body = new Uint8Array(await (await fetchOk(base + path)).arrayBuffer());
    const hash = sha256(body);
    if (expected && hash !== expected) throw new Error(`${path}: SHA-256 ${hash} does not match the published ${expected}`);
    writeFileSync(pilotDir + name, body);
    files[path] = { src: `${FROZEN_DIR}pilot/${name}`, sha256: hash, bytes: body.byteLength };
  };
  for (const a of pilotCase.assets) {
    await save(`assets/${a.name}`, a.name, a.sha256);
    if (a.units === "dB") await save(`display/${a.name}`, a.name.replace(/\.tif$/, ".png"));
  }
  const { corners: pilotCorners } = await get<{ corners: FrozenPilot["corners"] }>(`${base}display/after-HHHH.tif?bounds=true`);
  pilot = { case: pilotCase, corners: pilotCorners, files };
  console.log(`pilot ${pilotCase.id}: ${Object.keys(files).length} files, GeoTIFF hashes match the published manifest`);
} else console.log("no calibrated pilot on the backend; the snapshot will have none");

const manifest: FrozenCase = {
  version: FROZEN_VERSION,
  frozenAt: new Date().toISOString(),
  generator: "scripts/freeze-case.mts",
  processing: { ...PROCESSING, cornerMethod: "ASF KML LatLonQuad when public, else valid-pixel extent matched to the CMR footprint" },
  sources: {
    catalogue: "NASA Earthdata CMR (NISAR L2 GCOV), as stored by the CryoCore backend",
    quicklooks: "ASF DAAC public NISAR browse images (LATLON PNG)",
    backend: `${BACKEND}/api/v1/explorer, /api/v1/scenes and /api/v1/cases`,
  },
  focus: FOCUS,
  stacks: caseStacks.map((s) => ({ id: s.id, dates: s.items.map((a) => a.day).sort() })),
  explorer,
  acquisitions,
  totals: { scenes: acquisitions.length, images: toFreeze.length, bytes },
  pilot,
};
writeFileSync(`${out}case.json`, JSON.stringify(manifest));
console.log(`wrote public${FROZEN_DIR}case.json: ${acquisitions.length} scenes, ${toFreeze.length} images, ${(bytes / 1048576).toFixed(1)} MB`);
