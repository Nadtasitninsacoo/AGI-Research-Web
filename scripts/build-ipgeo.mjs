// Build the offline IP-geo index the Strategic Map reads, from the DB-IP
// City Lite dataset (free, CC-BY 4.0: https://db-ip.com/db/download/ip-to-city-lite).
//
// Output: <outDir>/bands/b<floor(lat)>.ndjson, one line per IP range:
//   startIpInt,endIpInt,lat,lon,countryCode,region,city
// plus <outDir>/meta.json. The reader is ipRangesInBoundsAction in
// src/app/map/actions.ts — keep this row format in sync with it.
//
// Usage: node scripts/build-ipgeo.mjs <dbip-city-lite.csv.gz> [outDir=data/ipgeo]

import { createReadStream, createWriteStream, mkdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { createGunzip } from "node:zlib";
import { createInterface } from "node:readline";

const SRC = process.argv[2];
const OUT = process.argv[3] || "data/ipgeo";

if (!SRC || !existsSync(SRC)) {
  console.error(
    `Source dataset not found: ${SRC ?? "(none given)"}\n` +
      `Download DB-IP City Lite (.csv.gz) from https://db-ip.com/db/download/ip-to-city-lite\n` +
      `then: node scripts/build-ipgeo.mjs <dbip-city-lite.csv.gz> [outDir]`,
  );
  process.exit(1);
}

const BANDS = `${OUT}/bands`;
rmSync(OUT, { recursive: true, force: true });
mkdirSync(BANDS, { recursive: true });

const streams = new Map();
const bandStream = (b) => {
  let s = streams.get(b);
  if (!s) {
    s = createWriteStream(`${BANDS}/b${b}.ndjson`);
    streams.set(b, s);
  }
  return s;
};

const ip2int = (ip) => {
  const p = String(ip).split(".");
  if (p.length !== 4) return null;
  let n = 0;
  for (const o of p) {
    const x = Number(o);
    if (!(x >= 0 && x <= 255)) return null;
    n = n * 256 + x;
  }
  return n >>> 0;
};

// DB-IP City Lite CSV row: start_ip,end_ip,continent,country,region,city,lat,lon
const ROW = /^([^,]+),([^,]+),[^,]*,([^,]*),("[^"]*"|[^,]*),("[^"]*"|[^,]*),(-?[\d.]+),(-?[\d.]+)$/;
const clean = (s) => String(s || "").replace(/^"|"$/g, "").replace(/,/g, " ").trim();

let total = 0, kept = 0, skippedV6 = 0;

async function build() {
  const rl = createInterface({
    input: createReadStream(SRC).pipe(createGunzip()),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    total++;
    const m = ROW.exec(line);
    if (!m) continue;
    const si = ip2int(m[1]);
    const ei = ip2int(m[2]);
    if (si === null || ei === null) {
      // IPv6 or malformed row — the map index is IPv4-only.
      skippedV6++;
      continue;
    }
    const lat = Number(m[6]), lon = Number(m[7]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const cc = m[3];
    const region = clean(m[4]);
    const city = clean(m[5]);

    bandStream(Math.floor(lat)).write(
      `${si},${ei},${lat.toFixed(3)},${lon.toFixed(3)},${cc},${region},${city}\n`,
    );
    kept++;
  }

  await Promise.all(
    [...streams.values()].map((s) => new Promise((r) => s.end(r))),
  );

  const bands = [...streams.keys()].sort((a, b) => a - b);
  writeFileSync(
    `${OUT}/meta.json`,
    JSON.stringify(
      { source: "DB-IP City Lite (CC-BY 4.0)", built: new Date().toISOString(), total, kept, skippedV6, bands },
      null,
      2,
    ),
  );

  console.log(
    `IP-geo index built: total=${total} kept=${kept} skippedV6=${skippedV6} bands=${bands.length} → ${OUT}`,
  );
}

build().catch((err) => {
  console.error("Build failed:", err?.message ?? err);
  process.exit(1);
});
