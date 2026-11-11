// MapLibre 6 loads its tile worker from a URL next to its module. Turbopack doesn't emit that file, so it is
// copied into public/vendor on install (git-ignored) and the map points at it with setWorkerUrl().
import { copyFileSync, mkdirSync, readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("../node_modules/maplibre-gl/package.json", import.meta.url), "utf8"));
const out = new URL("../public/vendor/", import.meta.url);
mkdirSync(out, { recursive: true });
copyFileSync(new URL("../node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url), new URL(`maplibre-gl-worker-${pkg.version}.mjs`, out));
console.log(`maplibre worker ${pkg.version} -> public/vendor`);
