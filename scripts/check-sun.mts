// Self-check for the sun math behind the live globe. Run: node --experimental-strip-types scripts/check-sun.mts
import assert from "node:assert/strict";
import { subsolar, sunElevation } from "../src/lib/globe.ts";

const near = (a: number, b: number, tol: number, what: string) => assert.ok(Math.abs(a - b) <= tol, `${what}: got ${a.toFixed(2)}, want ${b} ±${tol}`);

const jun = subsolar(new Date("2026-06-21T12:00:00Z"));
near(jun.lat, 23.44, 0.1, "June solstice subsolar latitude");
near(jun.lon, 0.42, 0.2, "June solstice subsolar longitude at 12:00 UTC (equation of time ≈ −1.7 min)");
const dec = subsolar(new Date("2026-12-21T12:00:00Z"));
near(dec.lat, -23.44, 0.1, "December solstice subsolar latitude");
// Ilulissat (69.2° N, 51.1° W) at local solar noon: polar night in December, high sun in June
near(sunElevation(69.2, -51.1, new Date("2026-12-21T15:24:00Z")), -2.6, 0.4, "Ilulissat noon elevation, 21 Dec");
near(sunElevation(69.2, -51.1, new Date("2026-06-21T15:24:00Z")), 44.2, 0.4, "Ilulissat noon elevation, 21 Jun");
console.log("sun math ok");
