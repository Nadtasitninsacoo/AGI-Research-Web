// Build a bbox-queryable index from the free DB-IP City Lite dataset.
//
// DB-IP City Lite (https://db-ip.com/db/download/ip-to-city-lite, CC-BY 4.0) maps
// IPv4/IPv6 ranges -> city + lat/lon. We INVERT it: bucket every IPv4 range by its
// 1° latitude band so a map-bounds query only reads the 1-3 band files it overlaps.
// This is a one-time, offline, keyless prep step — no API key, no scanning.
//
// Usage:  node scripts/build-ipgeo.mjs <dbip-city-lite.csv.gz> [outDir=data/ipgeo]

import { createReadStream, createWriteStream, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createGunzip } from "node:zlib";
import { createInterface } from "node:readline";

const SRC = process.argv[2];
const OUT = process.argv[3] || "data/ipgeo";
if (!SRC) { console.error("usage: node scripts/build-ipgeo.mjs <csv.gz> [outDir]"); process.exit(1); }

const BANDS = `${OUT}/bands`;
rmSync(OUT, { recursive: true, force: true });
mkdirSync(BANDS, { recursive: true });

const streams = new Map();
const bandStream = (b) => {
  let s = streams.get(b);
  if (!s) { s = createWriteStream(`${BANDS}/b${b}.ndjson`); streams.set(b, s); }
  return s;
};
const ip2int = (ip) => {
  const p = ip.split(".");
  if (p.length !== 4) return null;
  let n = 0;
  for (const o of p) { const x = Number(o); if (!(x >= 0 && x <= 255)) return null; n = n * 256 + x; }
  return n >>> 0;
};

const ROW = /^([^,]+),([^,]+),[^,]*,([^,]*),[^,]*,("[^"]*"|[^,]*),(-?[\d.]+),(-?[\d.]+)$/;
let total = 0, kept = 0;
const rl = createInterface({ input: createReadStream(SRC).pipe(createGunzip()), crlfDelay: Infinity });
for await (const line of rl) {
  total++;
  const m = ROW.exec(line);
  if (!m) continue;
  const si = ip2int(m[1]);
  const ei = ip2int(m[2]);
  if (si === null || ei === null) continue; // IPv4 only
  const lat = Number(m[5]), lon = Number(m[6]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) continue;
  const cc = m[3];
  const city = m[4].replace(/^"|"$/g, "").replace(/,/g, " ").trim();
  bandStream(Math.floor(lat)).write(`${si},${ei},${lat.toFixed(3)},${lon.toFixed(3)},${cc},${city}\n`);
  kept++;
}
await Promise.all([...streams.values()].map((s) => new Promise((r) => s.end(r))));
const bands = [...streams.keys()].sort((a, b) => a - b);
writeFileSync(`${OUT}/meta.json`, JSON.stringify({ source: "DB-IP City Lite (CC-BY 4.0)", built: new Date().toISOString(), total, kept, bands }));
console.log(`total=${total} kept=${kept} bands=${bands.length}`);
