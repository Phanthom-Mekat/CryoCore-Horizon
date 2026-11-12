// Freezes a snapshot of real NISAR GCOV metadata over Chattogram from NASA CMR,
// plus the public ASF browse images for the case-study stack, so the site works offline.
// Same query as backend/app/nasa.py (collections resolved by short-name pattern, same bbox).
// Usage: node scripts/fetch-chattogram.mjs
import sharp from "sharp";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const CMR = "https://cmr.earthdata.nasa.gov/search/";
const BBOX = [90.5, 20.5, 92.7, 24.3]; // backend/app/region.py, approximate discovery envelope
const CASE_STACK = "069_A_013"; // covers Chattogram city, Feni and the Sangu; one mode for every pass
const UA = { "User-Agent": "CryoCore-Horizon/0.1" };
const dataOut = fileURLToPath(new URL("../src/data/chattogram/", import.meta.url));
const browseOut = fileURLToPath(new URL("../public/data/chattogram/browse/", import.meta.url));
mkdirSync(dataOut, { recursive: true });
mkdirSync(browseOut, { recursive: true });

const get = async (url, as = "json") => {
  const r = await fetch(url, { headers: UA, redirect: "follow" });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return as === "json" ? r.json() : as === "text" ? r.text() : Buffer.from(await r.arrayBuffer());
};

const cols = (await get(`${CMR}collections.json?short_name=NISAR_L2_GCOV_*&options[short_name][pattern]=true&page_size=100`)).feed.entry;
const colParams = cols.map((c) => `collection_concept_id[]=${c.id}`).join("&");
const items = [];
for (let page = 1; ; page++) {
  const r = await get(`${CMR}granules.umm_json?${colParams}&bounding_box=${BBOX}&page_size=100&page_num=${page}&sort_key=start_date`);
  items.push(...r.items);
  if (items.length >= r.hits || !r.items.length) break;
}

const maturity = (shortName) => (shortName.includes("PROVISIONAL") ? "provisional" : shortName.includes("BETA") ? "beta" : "standard");
const seen = new Set();
const passes = [];
for (const { umm, meta } of items) {
  if (seen.has(umm.GranuleUR)) continue;
  seen.add(umm.GranuleUR);
  const a = Object.fromEntries(umm.AdditionalAttributes.map((x) => [x.Name, x.Values]));
  const urls = umm.RelatedUrls.filter((u) => u.URL.startsWith("https://"));
  // Browse files exist under both /NISAR/ (login required) and /BROWSE/ (public); prefer the public copy.
  const find = (end) => (urls.find((u) => u.URL.endsWith(end) && u.URL.includes("/BROWSE/")) ?? urls.find((u) => u.URL.endsWith(end)))?.URL ?? null;
  passes.push({
    id: meta["concept-id"],
    granule: umm.GranuleUR,
    collection: umm.CollectionReference.ShortName,
    maturity: maturity(umm.CollectionReference.ShortName),
    start: umm.TemporalExtent.RangeDateTime.BeginningDateTime,
    end: umm.TemporalExtent.RangeDateTime.EndingDateTime,
    stack: a.STACK_ID[0],
    track: Number(a.TRACK_NUMBER[0]),
    frame: Number(a.FRAME_NUMBER[0]),
    direction: a.ASCENDING_DESCENDING[0].toLowerCase(),
    cycle: Number(umm.GranuleUR.split("_")[4]),
    polA: a.FREQUENCY_A_POLARIZATION_CONCAT?.[0] ?? null,
    polB: a.FREQUENCY_B_POLARIZATION_CONCAT?.[0] ?? null,
    bandwidth: a.RANGE_BANDWIDTH_CONCAT?.[0] ?? null,
    version: a.PRODUCT_VERSION?.[0] ?? null,
    fullFrame: a.FULL_FRAME?.[0] === "TRUE",
    footprint: umm.SpatialExtent.HorizontalSpatialDomain.Geometry.GPolygons[0].Boundary.Points.map((p) => [p.Longitude, p.Latitude]),
    links: { data: find(".h5"), qa: find("_QA_REPORT.pdf"), browse: find("_LATLON.png") },
    browse: null,
    optical: null,
  });
}

// Browse images for the case stack. The LATLON PNG is a plain lat/lon grid, but its KML is only public for
// some collections, so georeference from the data itself: the opaque pixels' bounding box spans the
// footprint's lon/lat bounding box. Checked against a public KML (091_D_078, 30 Oct 2026): corners within
// 0.002°, under one pixel at the stored size.
async function extent(png, footprint) {
  const { data, info } = await sharp(png).extractChannel(3).raw().toBuffer({ resolveWithObject: true });
  let x0 = Infinity, x1 = -1, y0 = Infinity, y1 = -1;
  for (let y = 0; y < info.height; y++)
    for (let x = 0; x < info.width; x++)
      if (data[y * info.width + x]) {
        x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      }
  const lon = footprint.map((p) => p[0]), lat = footprint.map((p) => p[1]);
  const sx = (Math.max(...lon) - Math.min(...lon)) / (x1 + 1 - x0);
  const sy = (Math.max(...lat) - Math.min(...lat)) / (y1 + 1 - y0);
  const W = Math.min(...lon) - x0 * sx, N = Math.max(...lat) + y0 * sy;
  const E = W + info.width * sx, S = N - info.height * sy;
  const r = (v) => Math.round(v * 1e5) / 1e5;
  return [[r(W), r(N)], [r(E), r(N)], [r(E), r(S)], [r(W), r(S)]]; // TL, TR, BR, BL for MapLibre
}

for (const p of passes.filter((p) => p.stack === CASE_STACK && p.links.browse)) {
  const name = `${p.start.slice(0, 10)}.webp`;
  const png = await get(p.links.browse, "buffer");
  const quad = await extent(png, p.footprint);
  const info = await sharp(png).resize(1400).webp({ quality: 72, alphaQuality: 60 }).toFile(browseOut + name);
  p.browse = { src: `/data/chattogram/browse/${name}`, quad };

  // Same-morning optical view for the cloud comparison: MODIS Terra (about 10:30 local) on the local date of
  // the pass (UTC+6). Same bbox and pixel size as the browse image, so the two line up pixel for pixel.
  const day = new Date(Date.parse(p.start) + 6 * 3600e3).toISOString().slice(0, 10);
  const [[W, N], , [E, S]] = quad;
  const wms = `https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&LAYERS=MODIS_Terra_CorrectedReflectance_TrueColor&STYLES=&CRS=EPSG:4326&BBOX=${S},${W},${N},${E}&WIDTH=${info.width}&HEIGHT=${info.height}&FORMAT=image/jpeg&TIME=${day}`;
  const opt = `optical-${p.start.slice(0, 10)}.webp`;
  await sharp(await get(wms, "buffer")).webp({ quality: 70 }).toFile(browseOut + opt);
  p.optical = { src: `/data/chattogram/browse/${opt}`, date: day, layer: "MODIS Terra true colour (NASA GIBS)" };
  console.log(name, `${(info.size / 1024).toFixed(0)} KB`, opt);
}

const out = {
  retrievedAt: new Date().toISOString(),
  source: "NASA Earthdata CMR, NISAR L2 GCOV (ASF DAAC)",
  bbox: BBOX,
  caseStack: CASE_STACK,
  collections: cols.map((c) => ({ id: c.id, shortName: c.short_name })),
  passes,
};
writeFileSync(dataOut + "catalog.json", JSON.stringify(out));
console.log(`${passes.length} passes, ${passes.filter((p) => p.browse).length} browse images`);
