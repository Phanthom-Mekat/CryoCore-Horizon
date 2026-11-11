// Resizes NASA Earth textures into small WebP files in public/earth.
// Sources (NASA GIBS WMS, EPSG:4326, https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi):
//   global-day.jpg   LAYERS=BlueMarble_NextGeneration BBOX=-90,-180,90,180 4096x2048
//   global-night.jpg LAYERS=VIIRS_Black_Marble        BBOX=-90,-180,90,180 4096x2048
//   region-day.jpg   LAYERS=BlueMarble_NextGeneration BBOX=50,-95,85,5     4096x1434  (Greenland + Baffin Bay)
//   region-night.jpg LAYERS=VIIRS_Black_Marble        BBOX=50,-95,85,5     2048x717
// plus earth-water.png (three-globe) and earth_clouds_1024.png (three.js examples).
// Usage: node scripts/make-textures.mjs <source folder>
import sharp from "sharp";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const src = process.argv[2];
if (!src) throw new Error("pass the source folder");
const out = fileURLToPath(new URL("../public/earth/", import.meta.url));
mkdirSync(out, { recursive: true });

const jobs = [
  ["global-day.jpg", "day.webp", (s) => s.resize(2048, 1024).webp({ quality: 78 })],
  ["global-night.jpg", "night.webp", (s) => s.resize(2048, 1024).webp({ quality: 70 })],
  ["region-day.jpg", "region-day.webp", (s) => s.webp({ quality: 74 })],
  ["region-night.jpg", "region-night.webp", (s) => s.webp({ quality: 70 })],
  ["earth-water.png", "water.webp", (s) => s.resize(1024, 512).grayscale().webp({ quality: 60 })],
  ["earth_clouds_1024.png", "clouds.webp", (s) => s.ensureAlpha().extractChannel("alpha").resize(1024, 512).webp({ quality: 60 })], // cloud density lives in alpha
];
for (const [i, o, f] of jobs) {
  const info = await f(sharp(join(src, i))).toFile(join(out, o));
  console.log(o, `${(info.size / 1024).toFixed(0)} KB`);
}
