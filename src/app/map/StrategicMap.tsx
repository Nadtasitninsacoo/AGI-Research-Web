"use client";

import Link from "next/link";
import { useActionState, useCallback, useEffect, useRef, useState } from "react";
import type * as LType from "leaflet";
import * as mgrs from "mgrs";
import { launchCommandAction } from "../command/actions";
import { phoneAreaAction, geoipAction, portScanAction, shodanSearchAction, type PortRow } from "./actions";
import { Icon } from "@/components/Icon";

type Mode = "scan" | "mark" | "measure";
type LockPt = { lat: number; lon: number };
type SearchHit = { label: string; lat: number; lon: number; bbox?: [string, string, string, string]; sub?: string; phone?: boolean };

const isPhoneLike = (s: string) => {
  const digits = (s.match(/\d/g) ?? []).length;
  return /^\+?[\d\s().-]{7,}$/.test(s.trim()) && digits >= 7 && digits <= 15;
};

/**
 * Look up the GEOGRAPHIC AREA OF A PHONE NUMBER'S numbering plan (country, and
 * for landlines the area-code region) + carrier for mobiles. This is the region
 * the number is registered to — NOT the real-time location of whoever holds it,
 * which is impossible to get from a number. The parse runs in a server action
 * (its metadata library is Node-only); we geocode the resulting place here.
 */
async function lookupPhone(input: string): Promise<SearchHit | null> {
  const r = await phoneAreaAction(input);
  if (!r.ok) return null;
  const g = await geocode(r.place);
  if (!g) return null;
  const bits = [
    r.regionName ? `พื้นที่ ${r.regionName}` : `ประเทศ ${r.countryName}`,
    r.carrier && `ค่าย ${r.carrier}`,
    "พื้นที่ของรหัสเบอร์ ไม่ใช่ตำแหน่งตัวบุคคล",
  ].filter(Boolean);
  return { label: r.place, lat: g.lat, lon: g.lon, sub: bits.join(" · "), phone: true };
}

const fmt = (n: number) => n.toFixed(5);
const normLon = (lng: number) => ((lng + 540) % 360) - 180; // wrap to -180..180
const kmLabel = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${m.toFixed(0)} m`);
/** Geocode a single place name (Thai or English) to coordinates, or null. */
async function geocode(q: string): Promise<{ lat: number; lon: number; label: string } | null> {
  try {
    const url =
      "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&accept-language=th,en&q=" +
      encodeURIComponent(q);
    const r = await fetch(url, { headers: { Accept: "application/json" } });
    const d = (await r.json()) as Array<{ display_name: string; lat: string; lon: string }>;
    if (!Array.isArray(d) || !d.length) return null;
    return { lat: Number(d[0].lat), lon: Number(d[0].lon), label: d[0].display_name.split(",")[0] };
  } catch {
    return null;
  }
}
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

const bearing = (a: LType.LatLng, b: LType.LatLng) => {
  const toR = Math.PI / 180, toD = 180 / Math.PI;
  const y = Math.sin((b.lng - a.lng) * toR) * Math.cos(b.lat * toR);
  const x =
    Math.cos(a.lat * toR) * Math.sin(b.lat * toR) -
    Math.sin(a.lat * toR) * Math.cos(b.lat * toR) * Math.cos((b.lng - a.lng) * toR);
  return (Math.atan2(y, x) * toD + 360) % 360;
};

// Satellite imagery providers:
//   - "google": Google aerial tiles — sharpest, deepest coverage (alley level) in
//     Thailand, no key. NOTE: this is an unofficial tile endpoint and using it is
//     against Google's Terms of Service; it is enabled here at the operator's
//     explicit request for an internal tool. Swap to Mapbox for a licensed source.
//   - "mapbox": licensed, sharp to z22 global — used as default when a token is set.
//   - "esri": free, no key, but thin detail (placeholder tiles past ~z17).
type SatProvider = "google" | "mapbox" | "esri";
const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN?.trim() || "";
const HAS_MAPBOX = MAPBOX_TOKEN.length > 0;
// Order the provider switch cycles through. Licensed Mapbox leads when available.
const PROVIDERS: SatProvider[] = HAS_MAPBOX ? ["mapbox", "google", "esri"] : ["google", "esri"];

// Operator convenience: remember where the map was and how it was configured, so
// the console reopens exactly where you left off. Per-browser only (localStorage),
// fail-safe — any read/write error just falls back to defaults.
const MAP_PREFS_KEY = "agi.map.prefs.v1";
type MapPrefs = { layer?: "dark" | "sat"; provider?: SatProvider; labels?: boolean; lat?: number; lng?: number; zoom?: number };
function loadPrefs(): MapPrefs {
  try { return JSON.parse(localStorage.getItem(MAP_PREFS_KEY) || "{}") as MapPrefs; } catch { return {}; }
}
function patchPrefs(patch: MapPrefs) {
  try { localStorage.setItem(MAP_PREFS_KEY, JSON.stringify({ ...loadPrefs(), ...patch })); } catch { /* storage blocked */ }
}

// Military Grid Reference System — the coordinate standard NATO/militaries use.
// forward([lon,lat], 5) gives 1-metre precision; we group it for readability:
// "47P PR 65931 20229" = zone+band, 100 km square, easting, northing.
function mgrsStr(lat: number, lon: number): string {
  try {
    const s = mgrs.forward([lon, lat], 5);
    const m = s.match(/^(\d{1,2}[C-X])([A-Z]{2})(\d+)$/);
    if (!m) return s;
    const d = m[3], h = d.length / 2;
    return `${m[1]} ${m[2]} ${d.slice(0, h)} ${d.slice(h)}`;
  } catch { return "—"; }
}

/** Parse a typed MGRS grid ref (spaces optional) to lat/lon. Null if not MGRS. */
function parseMGRS(q: string): { lat: number; lon: number } | null {
  const s = q.toUpperCase().replace(/\s+/g, "");
  // zone(1-2) + band(C-X, no I/O) + 100km square(2 letters, no I/O) + even digits(2-10)
  if (!/^\d{1,2}[C-HJ-NP-X][A-HJ-NP-Z]{2}\d{2,10}$/.test(s)) return null;
  if (s.replace(/^\d{1,2}[C-HJ-NP-X][A-HJ-NP-Z]{2}/, "").length % 2 !== 0) return null;
  try {
    const [lon, lat] = mgrs.toPoint(s);
    return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
  } catch { return null; }
}

/** Parse raw decimal "lat, lon" (or space-separated) to coordinates. Null otherwise. */
function parseLatLon(q: string): { lat: number; lon: number } | null {
  const m = q.trim().match(/^(-?\d{1,2}(?:\.\d+)?)\s*[,\s]\s*(-?\d{1,3}(?:\.\d+)?)$/);
  if (!m) return null;
  const lat = Number(m[1]), lon = Number(m[2]);
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon };
}

// Persisted map annotations (marks + measurement path), per-browser, fail-safe.
const ANNOT_KEY = "agi.map.annot.v1";
type Annot = { marks: [number, number][]; measure: [number, number][] };
function loadAnnot(): Annot {
  try {
    const a = JSON.parse(localStorage.getItem(ANNOT_KEY) || "{}");
    return { marks: Array.isArray(a.marks) ? a.marks : [], measure: Array.isArray(a.measure) ? a.measure : [] };
  } catch { return { marks: [], measure: [] }; }
}
function saveAnnotRaw(a: Annot) {
  try { localStorage.setItem(ANNOT_KEY, JSON.stringify(a)); } catch { /* storage blocked */ }
}

export function StrategicMap() {
  const [state, action, pending] = useActionState(launchCommandAction, null);

  const [mode, setMode] = useState<Mode>("scan");
  const [pt, setPt] = useState<LockPt | null>(null);
  const [host, setHost] = useState("");
  const [zoom, setZoom] = useState(3);

  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);

  const [measureM, setMeasureM] = useState(0);
  const [markCount, setMarkCount] = useState(0);
  const [layer, setLayer] = useState<"dark" | "sat">("dark");
  const [satProvider, setSatProvider] = useState<SatProvider>(PROVIDERS[0]);
  const [showLabels, setShowLabels] = useState(true);
  const [locating, setLocating] = useState(false);
  const [locMsg, setLocMsg] = useState("");
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [isFs, setIsFs] = useState(false);
  const [hasData, setHasData] = useState(false); // any marks / measure to export?
  const [aiCmd, setAiCmd] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiMsg, setAiMsg] = useState("");
  const [geoBusy, setGeoBusy] = useState(false);
  const [geoMsg, setGeoMsg] = useState("");
  const [scanBusy, setScanBusy] = useState(false);
  const [scanMsg, setScanMsg] = useState("");
  const [ports, setPorts] = useState<PortRow[] | null>(null);

  // Leaflet objects live in a ref so React re-renders never recreate the map.
  const elRef = useRef<HTMLDivElement>(null);
  const L = useRef<typeof LType | null>(null);
  const map = useRef<LType.Map | null>(null);
  const scanMarker = useRef<LType.Marker | null>(null);
  const marksLayer = useRef<LType.LayerGroup | null>(null);
  const measureLayer = useRef<LType.LayerGroup | null>(null);
  const measurePts = useRef<LType.LatLng[]>([]);
  const measureLine = useRef<LType.Polyline | null>(null);
  const searchMarker = useRef<LType.Marker | null>(null);
  const meMarker = useRef<LType.Marker | null>(null);
  const meCircle = useRef<LType.Circle | null>(null);
  const geoMarker = useRef<LType.Marker | null>(null); // pinned IP/host geolocation
  const shodanLayer = useRef<LType.LayerGroup | null>(null); // Shodan OSINT host pins
  const darkTiles = useRef<LType.TileLayer | null>(null);
  const satGoogle = useRef<LType.TileLayer | null>(null);
  const satMapbox = useRef<LType.TileLayer | null>(null);
  const satEsri = useRef<LType.TileLayer | null>(null);
  const satLabels = useRef<LType.TileLayer | null>(null);       // Esri reference labels (any provider)
  const satGoogleLabels = useRef<LType.TileLayer | null>(null); // Google hybrid labels (roads + Thai names)
  const stageRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<HTMLSpanElement>(null); // live cursor coords, updated without re-render
  const mgrsRef = useRef<HTMLSpanElement>(null);   // live MGRS grid readout, updated without re-render
  // Always-current mode for the stable map click handler.
  const modeRef = useRef<Mode>(mode);
  useEffect(() => { modeRef.current = mode; }, [mode]);

  // --- Map bootstrap (once). Leaflet is imported dynamically so it never runs on the server. ---
  useEffect(() => {
    let disposed = false;
    // Read saved prefs synchronously, before the persist effect below can run on
    // mount with default state and overwrite them.
    const prefs = loadPrefs();
    (async () => {
      const leaflet = (await import("leaflet")).default;
      if (disposed || !elRef.current) return;
      L.current = leaflet;

      // Reopen where the operator last left the map, else start over Thailand.
      const startCenter: [number, number] =
        typeof prefs.lat === "number" && typeof prefs.lng === "number" ? [prefs.lat, prefs.lng] : [13.75, 100.5];
      const startZoom = typeof prefs.zoom === "number" ? prefs.zoom : 3;

      const m = leaflet.map(elRef.current, {
        worldCopyJump: true,   // seamless wrap when panning past the date line
        minZoom: 2,
        maxZoom: 22,           // deeper than imagery's native level; Leaflet upscales past maxNativeZoom
        zoomControl: false,
        attributionControl: true,
        maxBounds: undefined,  // no clamp -> explore the whole world
      }).setView(startCenter, startZoom);

      // BASE map: standard OpenStreetMap tiles (free, no key), always present.
      // A CSS filter (.lf-theme-dark) recolours this base into a dark theme.
      // It lives in the default tile pane and stays on even in satellite mode,
      // so if imagery tiles are missing/slow the street map still shows through
      // (the view can never go fully black).
      darkTiles.current = leaflet.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        subdomains: "abc",
        maxZoom: 22,
        maxNativeZoom: 19,   // OSM serves up to z19; upscale the rest
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      });

      // SATELLITE overlay in a SEPARATE pane above the base so the dark CSS filter
      // (scoped to the default tile pane) never inverts it, and so OSM shows
      // beneath any gaps.
      //
      // Provider: Mapbox Satellite when NEXT_PUBLIC_MAPBOX_TOKEN is set — far
      // better global high-res coverage (sharp to z22, including rural areas where
      // Esri shows "Map data not yet available"). Without a token it falls back to
      // Esri World Imagery (free, no key), which is sharp in cities but thin in the
      // countryside. @2x tiles (Mapbox) / detectRetina (Esri) keep imagery crisp on
      // high-DPI screens; maxNativeZoom caps real requests so deeper zoom upscales
      // rather than showing blank/placeholder tiles.
      m.createPane("sat");
      m.getPane("sat")!.style.zIndex = "250";

      // Google aerial (default, no key): sharpest alley-level detail in Thailand.
      // Unofficial endpoint — see the SatProvider note above. Subdomains mt0-3
      // spread load; lyrs=s is imagery only (labels come from the toggle layer).
      satGoogle.current = leaflet.tileLayer(
        "https://mt{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}",
        { pane: "sat", subdomains: ["0", "1", "2", "3"], maxZoom: 22, maxNativeZoom: 20, attribution: "Imagery &copy; Google" },
      );
      // Google hybrid labels (lyrs=h): transparent roads + place/soi names, aligned
      // to Google imagery — used instead of the Esri label layer when on Google.
      satGoogleLabels.current = leaflet.tileLayer(
        "https://mt{s}.google.com/vt/lyrs=h&x={x}&y={y}&z={z}",
        { pane: "sat", subdomains: ["0", "1", "2", "3"], maxZoom: 22, maxNativeZoom: 20, attribution: "" },
      );

      // Mapbox (only when a token is set): real high-res imagery to z22 with full
      // global coverage. @2x retina 512px tiles kept aligned with zoomOffset -1.
      if (HAS_MAPBOX) {
        satMapbox.current = leaflet.tileLayer(
          `https://api.mapbox.com/v4/mapbox.satellite/{z}/{x}/{y}@2x.jpg90?access_token=${MAPBOX_TOKEN}`,
          { pane: "sat", maxZoom: 22, maxNativeZoom: 22, tileSize: 512, zoomOffset: -1, attribution: "Imagery &copy; Mapbox, Maxar" },
        );
      }

      // Esri (free, always available as fallback/compare). maxNativeZoom is capped
      // at 17 — the level Esri has REAL imagery for everywhere on Earth. Deeper
      // zoom (z18-22) upscales that real tile instead of requesting levels Esri
      // lacks, which is what produced the gray "Map data not yet available" tiles.
      // So the view is blurrier when zoomed far in, but never shows placeholders.
      satEsri.current = leaflet.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        { pane: "sat", maxZoom: 22, maxNativeZoom: 17, detectRetina: true, attribution: "Imagery &copy; Esri, Maxar, Earthstar Geographics" },
      );
      satLabels.current = leaflet.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
        { pane: "sat", maxZoom: 22, maxNativeZoom: 17, detectRetina: true, attribution: "" },
      );

      darkTiles.current.addTo(m); // base is always on

      marksLayer.current = leaflet.layerGroup().addTo(m);
      measureLayer.current = leaflet.layerGroup().addTo(m);
      map.current = m;
      setZoom(m.getZoom());

      // Restore the saved imagery configuration (sanitising a provider that is no
      // longer available, e.g. a remembered "mapbox" after the token was removed).
      if (typeof prefs.labels === "boolean") setShowLabels(prefs.labels);
      if (prefs.provider && PROVIDERS.includes(prefs.provider)) setSatProvider(prefs.provider);
      if (prefs.layer === "sat") setLayer("sat");

      leaflet.control.scale({ metric: true, imperial: false, position: "bottomleft" }).addTo(m);

      // Persist the view as the operator pans/zooms, so the console reopens here.
      const saveView = () => {
        const c = m.getCenter();
        patchPrefs({ lat: c.lat, lng: normLon(c.lng), zoom: m.getZoom() });
      };
      m.on("zoomend", () => { setZoom(m.getZoom()); saveView(); });
      m.on("moveend", saveView);
      m.on("click", (e: LType.LeafletMouseEvent) => handleClick(e.latlng));
      // Live cursor coordinates — write straight to the DOM node to avoid a
      // React re-render on every mousemove.
      m.on("mousemove", (e: LType.LeafletMouseEvent) => {
        const lat = e.latlng.lat, lon = normLon(e.latlng.lng);
        if (cursorRef.current) cursorRef.current.textContent = `${fmt(lat)}, ${fmt(lon)}`;
        if (mgrsRef.current) mgrsRef.current.textContent = mgrsStr(lat, lon);
      });
      m.on("dblclick", () => {}); // reserved; dblclick zoom stays default

      // Restore saved marks + measurement path from a previous session.
      const annot = loadAnnot();
      for (const [la, ln] of annot.marks) addMark(leaflet.latLng(la, ln));
      if (annot.measure.length) {
        const pts = annot.measure.map(([la, ln]) => leaflet.latLng(la, ln));
        pts.forEach((ll) => leaflet.circleMarker(ll, { radius: 3, className: "lf-vertex" }).addTo(measureLayer.current!));
        measureLine.current = leaflet.polyline(pts, { className: "lf-measure-line" }).addTo(measureLayer.current!);
        measurePts.current = pts;
        let total = 0;
        for (let i = 1; i < pts.length; i++) {
          total += pts[i - 1].distanceTo(pts[i]);
          leaflet.tooltip({ permanent: true, direction: "right", className: "lf-tip lf-tip-dist" })
            .setLatLng(pts[i]).setContent(`${kmLabel(total)} · ${bearing(pts[i - 1], pts[i]).toFixed(0)}°`).addTo(measureLayer.current!);
        }
        setMeasureM(total);
        setHasData(true);
      }
    })();

    return () => {
      disposed = true;
      map.current?.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Click behaviour depends on the active tool ---
  // Serialize marks + measurement path so they survive a reload.
  const saveAnnot = useCallback(() => {
    const marks: [number, number][] = [];
    marksLayer.current?.eachLayer((lyr) => {
      const ll = (lyr as LType.Marker).getLatLng?.();
      if (ll) marks.push([ll.lat, normLon(ll.lng)]);
    });
    saveAnnotRaw({ marks, measure: measurePts.current.map((p) => [p.lat, normLon(p.lng)]) });
  }, []);

  // Place a draggable mark (shared by click, AI command and restore) with its
  // tooltip, drag-relabel, right-click-remove and persistence wired in.
  const addMark = useCallback((latlng: LType.LatLng, labelText?: string) => {
    const leaflet = L.current;
    if (!leaflet || !marksLayer.current) return;
    const marker = leaflet.marker(latlng, { icon: pinIcon(leaflet, "mark"), draggable: true }).addTo(marksLayer.current);
    const auto = () => `${fmt(marker.getLatLng().lat)}, ${fmt(normLon(marker.getLatLng().lng))}`;
    marker.bindTooltip(labelText ?? auto(), { direction: "top", offset: [0, -10], className: "lf-tip" });
    if (!labelText) marker.on("drag", () => marker.setTooltipContent(auto()));
    marker.on("dragend", saveAnnot);
    marker.on("contextmenu", () => {
      marksLayer.current!.removeLayer(marker);
      setMarkCount((c) => c - 1);
      setHasData((marksLayer.current?.getLayers().length ?? 0) > 0 || measurePts.current.length > 0);
      saveAnnot();
    });
    setMarkCount((c) => c + 1);
    setHasData(true);
  }, [saveAnnot]);

  const handleClick = useCallback((latlng: LType.LatLng) => {
    const leaflet = L.current;
    const m = map.current;
    if (!leaflet || !m) return;
    const lat = latlng.lat;
    const lon = normLon(latlng.lng);

    if (modeRef.current === "scan") {
      setPt({ lat, lon });
      if (scanMarker.current) {
        scanMarker.current.setLatLng(latlng);
      } else {
        scanMarker.current = leaflet
          .marker(latlng, { icon: pinIcon(leaflet, "scan"), zIndexOffset: 1000 })
          .addTo(m);
      }
      return;
    }

    if (modeRef.current === "mark") {
      addMark(latlng);
      saveAnnot();
      return;
    }

    // measure: append a vertex, redraw the line, sum segment lengths + bearing
    measurePts.current.push(latlng);
    const pts = measurePts.current;
    leaflet.circleMarker(latlng, { radius: 3, className: "lf-vertex" }).addTo(measureLayer.current!);
    if (!measureLine.current) {
      measureLine.current = leaflet.polyline(pts, { className: "lf-measure-line" }).addTo(measureLayer.current!);
    } else {
      measureLine.current.setLatLngs(pts);
    }
    let total = 0;
    for (let i = 1; i < pts.length; i++) total += pts[i - 1].distanceTo(pts[i]);
    setMeasureM(total);
    setHasData(true);
    if (pts.length > 1) {
      const prev = pts[pts.length - 2];
      const seg = prev.distanceTo(latlng);
      leaflet
        .tooltip({ permanent: true, direction: "right", className: "lf-tip lf-tip-dist" })
        .setLatLng(latlng)
        .setContent(`${kmLabel(total)} · ${bearing(prev, latlng).toFixed(0)}° · +${kmLabel(seg)}`)
        .addTo(measureLayer.current!);
    }
    saveAnnot();
  }, [addMark, saveAnnot]);

  // --- Place search (Nominatim, Thai + English), debounced ---
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setHits([]); return; }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        // Military grid (MGRS) — jump straight to the point, no network.
        const mg = parseMGRS(q);
        if (mg) {
          setHits([{ label: `MGRS ${mgrsStr(mg.lat, mg.lon)}`, lat: mg.lat, lon: mg.lon, sub: `${fmt(mg.lat)}, ${fmt(mg.lon)}` }]);
          return;
        }
        // Raw decimal "lat, lon".
        const cc = parseLatLon(q);
        if (cc) {
          setHits([{ label: `${fmt(cc.lat)}, ${fmt(cc.lon)}`, lat: cc.lat, lon: cc.lon, sub: `MGRS ${mgrsStr(cc.lat, cc.lon)}` }]);
          return;
        }
        // Phone number? Resolve its numbering-plan area instead of a place search.
        if (isPhoneLike(q)) {
          const hit = await lookupPhone(q);
          setHits(hit ? [hit] : []);
          return;
        }
        const url =
          "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&accept-language=th,en&q=" +
          encodeURIComponent(q);
        const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: "application/json" } });
        const data = (await res.json()) as Array<{ display_name: string; lat: string; lon: string; boundingbox?: string[] }>;
        setHits(
          data.map((d) => ({
            label: d.display_name,
            lat: Number(d.lat),
            lon: Number(d.lon),
            bbox: d.boundingbox as SearchHit["bbox"],
          })),
        );
      } catch {
        /* aborted or offline */
      } finally {
        setSearching(false);
      }
    }, 450);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [query]);

  const gotoHit = useCallback((h: SearchHit) => {
    const leaflet = L.current;
    const m = map.current;
    if (!leaflet || !m) return;

    // Drop (or move) a marker on the found place so its centre is clearly shown.
    const latlng: [number, number] = [h.lat, h.lon];
    const name = h.label.split(",")[0];
    if (searchMarker.current) {
      searchMarker.current.setLatLng(latlng);
    } else {
      searchMarker.current = leaflet
        .marker(latlng, { icon: pinIcon(leaflet, "search"), zIndexOffset: 900 })
        .addTo(m);
    }
    searchMarker.current
      .bindTooltip(name, { permanent: true, direction: "top", offset: [0, -10], className: "lf-tip" })
      .openTooltip();

    if (h.bbox) {
      const [s, n, w, e] = h.bbox.map(Number);
      m.fitBounds([[s, w], [n, e]], { maxZoom: 15 });
    } else {
      // A precise point (MGRS / lat-lon / exact place) — zoom in close.
      m.setView(latlng, 16);
    }
    setHits([]);
    setQuery(name);
  }, []);

  const refreshHasData = useCallback(() => {
    const marks = marksLayer.current?.getLayers().length ?? 0;
    setHasData(marks > 0 || measurePts.current.length > 0);
  }, []);
  const clearMarks = useCallback(() => { marksLayer.current?.clearLayers(); setMarkCount(0); refreshHasData(); saveAnnot(); }, [refreshHasData, saveAnnot]);
  const clearMeasure = useCallback(() => {
    measureLayer.current?.clearLayers();
    measurePts.current = [];
    measureLine.current = null;
    setMeasureM(0);
    refreshHasData();
    saveAnnot();
  }, [refreshHasData, saveAnnot]);

  // Remember the imagery configuration across sessions.
  useEffect(() => { patchPrefs({ layer, provider: satProvider, labels: showLabels }); }, [layer, satProvider, showLabels]);

  // The chosen provider's layer (falling back if one isn't built, e.g. Mapbox
  // without a token).
  const activeSat = useCallback(() => {
    const byName = { google: satGoogle.current, mapbox: satMapbox.current, esri: satEsri.current };
    return byName[satProvider] ?? satGoogle.current ?? satEsri.current;
  }, [satProvider]);

  // The OSM base stays on always; this shows/hides the active satellite overlay
  // and its label layer on top of it, swaps providers (removing every inactive
  // imagery/label layer so they never stack), and uses Google's own hybrid labels
  // when on Google imagery (crisp roads + Thai soi names), Esri labels otherwise.
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const allImg = [satGoogle.current, satMapbox.current, satEsri.current];
    const allLbl = [satLabels.current, satGoogleLabels.current];
    const active = activeSat();
    const labels = satProvider === "google" ? satGoogleLabels.current : satLabels.current;
    if (layer === "sat") {
      for (const t of allImg) if (t && t !== active && m.hasLayer(t)) m.removeLayer(t);
      if (active && !m.hasLayer(active)) active.addTo(m);
      for (const t of allLbl) if (t && t !== labels && m.hasLayer(t)) m.removeLayer(t);
      if (labels) {
        if (showLabels && !m.hasLayer(labels)) labels.addTo(m);
        if (!showLabels && m.hasLayer(labels)) m.removeLayer(labels);
      }
    } else {
      for (const t of [...allImg, ...allLbl]) if (t && m.hasLayer(t)) m.removeLayer(t);
    }
  }, [layer, showLabels, satProvider, activeSat]);

  // "Find my location" — browser GPS/geolocation, then zoom in close (house level).
  const locate = useCallback(() => {
    const leaflet = L.current, m = map.current;
    if (!leaflet || !m) return;
    setLocMsg("");
    setLocating(true);
    m.locate({ setView: true, maxZoom: 19, enableHighAccuracy: true, timeout: 10_000 });
    m.once("locationfound", (e: LType.LocationEvent) => {
      setLocating(false);
      // Turn on satellite imagery immediately (don't wait for the React effect),
      // so "see my house" works right away. OSM base stays beneath as fallback.
      const sat = activeSat();
      if (sat && !m.hasLayer(sat)) sat.addTo(m);
      const labels = satProvider === "google" ? satGoogleLabels.current : satLabels.current;
      if (showLabels && labels && !m.hasLayer(labels)) labels.addTo(m);
      setLayer("sat");
      setAccuracy(e.accuracy);
      if (meMarker.current) meMarker.current.setLatLng(e.latlng);
      else meMarker.current = leaflet.marker(e.latlng, { icon: pinIcon(leaflet, "me"), zIndexOffset: 1100 }).addTo(m);
      meMarker.current.bindTooltip("คุณอยู่ที่นี่", { permanent: true, direction: "top", offset: [0, -10], className: "lf-tip" }).openTooltip();
      // Accuracy circle: radius = reported GPS accuracy in metres.
      if (meCircle.current) meCircle.current.setLatLng(e.latlng).setRadius(e.accuracy);
      else meCircle.current = leaflet.circle(e.latlng, { radius: e.accuracy, className: "lf-accuracy" }).addTo(m);
    });
    m.once("locationerror", (e: LType.ErrorEvent) => {
      setLocating(false);
      setLocMsg(/denied|permission/i.test(e.message) ? "ไม่ได้รับอนุญาตให้เข้าถึงตำแหน่ง" : "หาตำแหน่งไม่สำเร็จ");
    });
  }, [showLabels, activeSat, satProvider]);

  // Geolocate the IP/host in the target field and pin its approximate position.
  // This is OSINT only (DNS + geo-IP DB) — it does NOT scan or connect to the host.
  const geoLocateIp = useCallback(async (targetArg?: string) => {
    const q = (targetArg ?? host).trim();
    if (!q || geoBusy) return;
    if (targetArg) setHost(targetArg);
    setGeoBusy(true);
    setGeoMsg("");
    const r = await geoipAction(q);
    setGeoBusy(false);
    if (!r.ok) { setGeoMsg(r.message); return; }
    const leaflet = L.current, m = map.current;
    if (!leaflet || !m) return;
    const ll = leaflet.latLng(r.lat, r.lon);
    const where = [r.city, r.region, r.country].filter(Boolean).join(", ") || "ไม่ทราบเมือง";
    const tip =
      `${r.ip}${r.host ? ` (${r.host})` : ""}<br>${where}` +
      `${r.isp ? `<br>${r.isp}` : ""}<br>MGRS ${mgrsStr(r.lat, r.lon)}`;
    if (geoMarker.current) geoMarker.current.setLatLng(ll);
    else geoMarker.current = leaflet.marker(ll, { icon: pinIcon(leaflet, "search"), zIndexOffset: 1200 }).addTo(m);
    geoMarker.current.bindTooltip(tip, { permanent: true, direction: "top", offset: [0, -10], className: "lf-tip" }).openTooltip();
    m.setView(ll, 11);
    setGeoMsg(`${r.ip} → ${where}${r.isp ? ` · ${r.isp}` : ""}`);
  }, [host, geoBusy]);

  // ACTIVE port scan of the target host with nmap. This DOES connect to the host
  // (unlike the OSINT geolocate) — for authorized engagements only.
  const portScan = useCallback(async (allPorts: boolean, targetArg?: string, portsArg?: string) => {
    const q = (targetArg ?? host).trim();
    if (!q || scanBusy) return;
    if (targetArg) setHost(targetArg);
    setScanBusy(true);
    setScanMsg(`กำลังสแกน ${q}${portsArg ? ` พอร์ต ${portsArg}` : ""} ด้วย nmap...`);
    setPorts(null);
    const r = await portScanAction(q, { allPorts, ports: portsArg });
    setScanBusy(false);
    if (!r.ok) { setScanMsg(r.message); setPorts(null); return; }
    setPorts(r.open);
    if (!r.up && r.open.length === 0) {
      setScanMsg(`${r.target}: ไม่ตอบสนอง/ไม่มีพอร์ตเปิด (${r.scanned}, ${r.seconds}s)`);
    } else if (r.open.length === 0) {
      setScanMsg(`${r.target}: host ตอบสนองแต่ไม่พบพอร์ตเปิดใน ${r.scanned} (${r.seconds}s)`);
    } else {
      setScanMsg(`${r.target}: พบ ${r.open.length} พอร์ตเปิด (${r.scanned}, ${r.seconds}s)`);
    }
    // Surface the open-port count on the scan/geo pin if one exists.
    const label = `${r.target}<br>${r.open.length} พอร์ตเปิด: ${r.open.map((p) => p.port).join(", ") || "—"}`;
    const mk = geoMarker.current ?? scanMarker.current;
    mk?.bindTooltip(label, { permanent: false, direction: "top", offset: [0, -10], className: "lf-tip" });
  }, [host, scanBusy]);

  // OSINT: pull hosts Shodan has already indexed in an AREA and pin them.
  // Read-only — this does NOT scan; it reads Shodan's database. Returns a status
  // string for the AI bar to show.
  const shodanArea = useCallback(async (place: string): Promise<string> => {
    const leaflet = L.current, m = map.current;
    if (!leaflet || !m) return "แผนที่ยังไม่พร้อม";
    const r = await shodanSearchAction(place);
    if (!r.ok) return r.message;
    if (!shodanLayer.current) shodanLayer.current = leaflet.layerGroup().addTo(m);
    shodanLayer.current.clearLayers();
    let plotted = 0;
    let bounds: LType.LatLngBounds | null = null;
    for (const h of r.hosts) {
      if (!Number.isFinite(h.lat) || !Number.isFinite(h.lon)) continue;
      const ll = leaflet.latLng(h.lat, h.lon);
      const ports = h.ports.slice(0, 12).join(", ") + (h.ports.length > 12 ? "…" : "");
      const who = [h.org || h.isp, h.product].filter(Boolean).join(" · ");
      const tip =
        `<b>${h.ip}</b>${h.hostnames[0] ? ` (${h.hostnames[0]})` : ""}` +
        `<br>พอร์ต: ${ports || "—"}${who ? `<br>${who}` : ""}` +
        `${h.city ? `<br>${h.city}, ${h.country}` : ""}`;
      leaflet
        .marker(ll, { icon: pinIcon(leaflet, "search") })
        .bindTooltip(tip, { direction: "top", offset: [0, -10], className: "lf-tip" })
        .addTo(shodanLayer.current);
      bounds = bounds ? bounds.extend(ll) : leaflet.latLngBounds(ll, ll);
      plotted += 1;
    }
    if (bounds) m.fitBounds(bounds, { padding: [50, 50], maxZoom: 13 });
    else if (r.center) m.setView([r.center.lat, r.center.lon], 11);
    if (plotted === 0) return `Shodan: ${r.place} — ไม่พบ host ที่ระบุพิกัดได้ (ทั้งหมด ${r.total})`;
    return `Shodan: ${r.place} — ปักหมุด ${plotted} host (พบทั้งหมด ${r.total}) · query: ${r.query}`;
  }, []);

  // Fullscreen the map stage (Fullscreen API), re-fitting Leaflet afterwards.
  const toggleFullscreen = useCallback(() => {
    const el = stageRef.current;
    if (!el) return;
    if (!document.fullscreenElement) el.requestFullscreen?.().catch(() => {});
    else document.exitFullscreen?.().catch(() => {});
  }, []);
  useEffect(() => {
    const onFs = () => {
      setIsFs(Boolean(document.fullscreenElement));
      setTimeout(() => map.current?.invalidateSize(), 120);
    };
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  // Keyboard shortcuts (ignored while typing in a field).
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      const el = ev.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      switch (ev.key.toLowerCase()) {
        case "1": setMode("scan"); break;
        case "2": setMode("mark"); break;
        case "3": setMode("measure"); break;
        case "l": locate(); break;
        case "b": setLayer((l) => (l === "dark" ? "sat" : "dark")); break;
        case "f": toggleFullscreen(); break;
        case "+": case "=": map.current?.zoomIn(); break;
        case "-": map.current?.zoomOut(); break;
        default: return;
      }
      ev.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [locate, toggleFullscreen]);

  // Export all marks + the measure line as a GeoJSON file.
  const exportGeoJSON = useCallback(() => {
    type Feature = { type: "Feature"; geometry: { type: string; coordinates: unknown }; properties: Record<string, unknown> };
    const features: Feature[] = [];
    marksLayer.current?.eachLayer((lyr) => {
      const mk = lyr as LType.Marker;
      if (typeof mk.getLatLng !== "function") return;
      const ll = mk.getLatLng();
      features.push({ type: "Feature", geometry: { type: "Point", coordinates: [normLon(ll.lng), ll.lat] }, properties: { kind: "mark" } });
    });
    if (measurePts.current.length > 1) {
      features.push({
        type: "Feature",
        geometry: { type: "LineString", coordinates: measurePts.current.map((p) => [normLon(p.lng), p.lat]) },
        properties: { kind: "measure", meters: Math.round(measureM) },
      });
    }
    if (pt) features.push({ type: "Feature", geometry: { type: "Point", coordinates: [pt.lon, pt.lat] }, properties: { kind: "scan-target", host } });
    const blob = new Blob([JSON.stringify({ type: "FeatureCollection", features }, null, 2)], { type: "application/geo+json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `agi-map-${Date.now()}.geojson`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, [measureM, pt, host]);

  const copyCoord = useCallback(() => {
    if (pt) navigator.clipboard?.writeText(`${fmt(pt.lat)}, ${fmt(pt.lon)}`).catch(() => {});
  }, [pt]);

  // --- Natural-language command: "มาร์คกรุงเทพ", "ลากเส้นจากกรุงเทพไปเชียงใหม่",
  //     "ระยะจากภูเก็ตถึงโตเกียว", "ล้าง" — geocode places then act on the map. ---
  const runAiCommand = useCallback(async () => {
    const leaflet = L.current, m = map.current;
    if (!leaflet || !m) return;
    const raw = aiCmd.trim();
    if (!raw) return;
    const lc = raw.toLowerCase();

    if (/(ล้าง|เคลียร์|ลบทั้งหมด|clear|reset)/.test(lc)) {
      clearMarks();
      clearMeasure();
      if (searchMarker.current) { m.removeLayer(searchMarker.current); searchMarker.current = null; }
      shodanLayer.current?.clearLayers();
      setAiMsg("ล้างแผนที่แล้ว");
      return;
    }

    // --- Recon intents: nmap port scan and/or IP geolocate, in any combination.
    //     "สแกนพอร์ต 8.8.8.8", "สแกนพอร์ต 80,443 ของ 1.2.3.4", "nmap 10.0.0.5 ครบ",
    //     "สแกน 1.2.3.4 แล้วปักหมุด", "ปักหมุด scanme.nmap.org". ---
    const ipM = raw.match(/\b\d{1,3}(?:\.\d{1,3}){3}\b/);
    const hostM = raw.match(/\b[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)+\b/i);
    const reconTarget = (ipM?.[0] || hostM?.[0] || "").trim();
    // Test keywords with the target removed, so a hostname that happens to
    // contain "nmap"/"scan" (e.g. scanme.nmap.org) can't fake a scan intent.
    const lcs = (reconTarget ? raw.split(reconTarget).join(" ") : raw).toLowerCase();

    // OSINT area lookup via Shodan: "shodan มอสโก", "หา host ในโตเกียว",
    // "ไอพีในลอนดอน". Only for AREAS (no IP/host in the command) — read-only.
    const shodanIntent =
      /(shodan|โชดาน|osint|หาโฮสต์|หา\s*host|โฮสต์ใน|host\s*ใน|ไอพีใน|ip\s*ใน|เครื่องใน|host ในพื้นที่)/i.test(lcs);
    if (shodanIntent && !reconTarget) {
      const place = raw
        .replace(/(shodan|โชดาน|osint|หาโฮสต์|หา\s*host|โฮสต์|hosts?|ไอพี|\bip\b|เครื่อง|ในพื้นที่|บริเวณ|พื้นที่|ในเมือง|ที่เมือง|เมือง|ใน|ที่|\bin\b|\bat\b)/gi, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (!place) { setAiMsg('บอกพื้นที่ด้วย เช่น "shodan มอสโก" หรือ "หา host ในโตเกียว"'); return; }
      setAiBusy(true);
      setAiMsg(`กำลังค้น Shodan ในพื้นที่ ${place}...`);
      const msg = await shodanArea(place);
      setAiMsg(msg);
      setAiBusy(false);
      return;
    }

    const scanIntent =
      /(สแกนพอร์ต|สแกนพอร์ท|สแกนหาพอร์ต|สแกน\s*port|scan\s*ports?|port\s*scan|nmap|พอร์ตเปิด|open\s*ports?|เช็[คก]\s*พอร์ต|ตรวจ\s*พอร์ต|หา\s*พอร์ต|หา\s*port)/i.test(lcs) ||
      // generic: a "scan" verb plus either a real target or the word "port"
      (/(สแกน|scan)/i.test(lcs) && (reconTarget !== "" || /(พอร์ต|port)/i.test(lcs)));
    const pinIntent =
      /(ปักหมุด|ปักจุด|หมุด|ตำแหน่งไอพี|ตำแหน่ง|พิกัดไอพี|geo-?locate|geoip|locate|อยู่ที่ไหน|อยู่ไหน|ที่ไหน|where is|where)/i.test(lcs);

    if (scanIntent || (pinIntent && reconTarget)) {
      const target = reconTarget || host.trim();
      if (!target) { setAiMsg('ต้องระบุ IP หรือ host ที่จะสแกน เช่น "สแกนพอร์ต 8.8.8.8" หรือ "สแกนหา port scanme.nmap.org" — ชื่อเมือง/สถานที่สแกนไม่ได้ (เมืองไม่ใช่โฮสต์)'); return; }

      // Custom ports: "พอร์ต 80,443", "ports 1-1000", or a bare "22,80,443" token.
      // The (?![\d.]) lookahead stops the keyword form from eating an IP octet.
      const kw = raw.match(/(?:พอร์ต|พอร์ท|ports?|port|-p)\s*(\d{1,5}(?:[,-]\d{1,5})*)(?![\d.])/i);
      const bare = raw.match(/\b\d{1,5}(?:[,-]\d{1,5})+\b/);
      const portsArg = (kw?.[1] || bare?.[0] || "").trim() || undefined;
      const allPorts = !portsArg && /(top\s*1000|1000|ครบ|เต็ม|ลึก|ทั้งหมด|full|deep)/i.test(lc);

      if (!scanIntent && pinIntent) {
        setAiMsg(`สั่งปักหมุดตำแหน่ง ${target}...`);
        await geoLocateIp(target);
        return;
      }

      const parts = [portsArg ? `พอร์ต ${portsArg}` : allPorts ? "top 1000" : "top 100"];
      if (pinIntent) parts.push("ปักหมุดตำแหน่ง");
      setAiMsg(`สั่งสแกน ${target} ด้วย nmap (${parts.join(" + ")})...`);
      if (pinIntent) await geoLocateIp(target);
      await portScan(allPorts, target, portsArg);
      return;
    }

    // Scan/port words but no IP/host in the command or the field: the user is
    // trying to "scan a place". Explain instead of silently geocoding the phrase
    // (which fails). A city is not a scan target — a port scan needs a host.
    if (/(สแกน|scan|nmap)/i.test(lcs) && /(พอร์ต|port)/i.test(lcs) && !reconTarget && !host.trim()) {
      setAiMsg('สแกนพอร์ตต้องระบุเป้าหมายเป็น IP หรือ host เช่น "สแกนพอร์ต 8.8.8.8" — ชื่อเมือง/สถานที่สแกนไม่ได้ (เมืองไม่ใช่โฮสต์ ไม่มีพอร์ตให้สแกน)');
      return;
    }

    const wantsMeasure = /(ลากเส้น|เส้นทาง|ระยะทาง|วัดระยะ|ไกลแค่ไหน|ไกลกี่|กี่กิโล|กี่กม|distance|measure|route|how far)/i.test(lc);
    const wantsMark = /(มาร์ค|มาร์ก|ปักหมุด|ปักจุด|หมุด|mark|pin)/i.test(lc);

    // 1) Strip command words. Only multi-syllable, unambiguous ones — bare short
    //    words like วัด/หา/ขอ/ปัก are excluded because they also live INSIDE place
    //    names (จัง[หวัด], [ขอ]นแก่น, [หา]ดใหญ่). Thai needs no \b (it doesn't work
    //    on Thai script); English keeps \b so "line" doesn't eat "Caroline".
    //    Connectors (จาก/ไป/ถึง...) are NOT stripped — they split places below.
    const cleaned = raw
      .replace(/(ช่วยหน่อย|ช่วย|โปรดช่วย|โปรด|หน่อย|ให้ฉัน|อยากรู้|อยากทราบ|อยาก|ค้นหาพิกัด|หาพิกัด|พิกัดของ|พิกัด|ตำแหน่งของ|ตำแหน่ง|ค้นหา|ค้นดู|แสดง|โชว์|คำนวณ|วัดระยะทาง|วัดระยะ|ระยะทาง|ระยะ|ลากเส้นทาง|ลากเส้น|เส้นทาง|มาร์คจุด|มาร์ค|มาร์ก|ปักหมุด|ปักจุด|ไกลแค่ไหน|ไกลกี่|กี่กิโลเมตร|กี่กิโล|กี่กม)/g, " ")
      .replace(/\b(please|find|search|show|locate|where is|where|mark|pin|draw line|draw|route|measure|distance|calculate|how far)\b/gi, " ");
    // 2) Split into place names by connectors (longest first: ไปยัง/ไปที่ before ไป).
    const places = cleaned
      .split(/→|->|—|–|\/|,|、|·|ไปยัง|ไปที่|ไป|จากที่|จาก|จนถึง|ถึง|สู่|กับ|และ|\bto\b|\bfrom\b|\band\b|\bvs\b/gi)
      .map((s) => s.replace(/^(ที่|ที|ของ|กม|กิโลเมตร)\s*/u, "").trim())
      .filter((s) => s.length > 1)
      .slice(0, 8);

    if (places.length === 0) { setAiMsg('ไม่พบชื่อสถานที่ในคำสั่ง — เช่น "ลากเส้นจากกรุงเทพไปเชียงใหม่" หรือ "ค้นหาอำเภอพยุห์"'); return; }

    setAiBusy(true);
    setAiMsg(`กำลังค้นหา ${places.length} สถานที่...`);

    const found: { ll: LType.LatLng; label: string }[] = [];
    const missed: string[] = [];
    for (const name of places) {
      let g = await geocode(name);
      if (!g) {
        // Fallback: retry without administrative prefixes (จังหวัด/อำเภอ/ประเทศ...).
        const alt = name.replace(/(จังหวัด|จ\.|อำเภอ|อ\.|ตำบล|ต\.|เมือง|ประเทศ|แขวง|เขต)\s*/gu, " ").trim();
        if (alt && alt !== name) { await wait(350); g = await geocode(alt); }
      }
      if (g) found.push({ ll: leaflet.latLng(g.lat, g.lon), label: g.label });
      else missed.push(name);
      await wait(350); // respect Nominatim rate limit (~1 req/s)
    }

    if (found.length === 0) {
      setAiBusy(false);
      setAiMsg(`หาสถานที่ไม่เจอ: ${missed.join(", ")}`);
      return;
    }

    const doMeasure = wantsMeasure || (!wantsMark && found.length >= 2);

    if (doMeasure && found.length >= 2) {
      clearMeasure();
      const pts = found.map((f) => f.ll);
      pts.forEach((ll) => leaflet.circleMarker(ll, { radius: 3, className: "lf-vertex" }).addTo(measureLayer.current!));
      measureLine.current = leaflet.polyline(pts, { className: "lf-measure-line" }).addTo(measureLayer.current!);
      measurePts.current = pts;
      let total = 0;
      for (let i = 1; i < pts.length; i++) {
        total += pts[i - 1].distanceTo(pts[i]);
        leaflet
          .tooltip({ permanent: true, direction: "right", className: "lf-tip lf-tip-dist" })
          .setLatLng(pts[i])
          .setContent(`${kmLabel(total)} · ${bearing(pts[i - 1], pts[i]).toFixed(0)}°`)
          .addTo(measureLayer.current!);
      }
      // Label the endpoints so you know which is which.
      found.forEach((f) =>
        leaflet.marker(f.ll, { icon: pinIcon(leaflet, "mark") }).addTo(measureLayer.current!)
          .bindTooltip(f.label, { direction: "top", offset: [0, -10], className: "lf-tip" }),
      );
      setMeasureM(total);
      setMode("measure");
      setHasData(true);
      saveAnnot();
      m.fitBounds(leaflet.latLngBounds(pts), { padding: [60, 60], maxZoom: 15 });
      setAiMsg(`ลากเส้น ${found.map((f) => f.label).join(" → ")} · รวม ${kmLabel(total)}` + (missed.length ? ` (ข้าม: ${missed.join(", ")})` : ""));
    } else {
      // mark each place (persisted, same behaviour as a manual mark)
      found.forEach((f) => addMark(f.ll, f.label));
      saveAnnot();
      setMode("mark");
      setHasData(true);
      if (found.length === 1) m.setView(found[0].ll, 13);
      else m.fitBounds(leaflet.latLngBounds(found.map((f) => f.ll)), { padding: [60, 60], maxZoom: 15 });
      setAiMsg(`มาร์ค ${found.length} จุด: ${found.map((f) => f.label).join(", ")}` + (missed.length ? ` (ข้าม: ${missed.join(", ")})` : ""));
    }
    setAiBusy(false);
  }, [aiCmd, clearMarks, clearMeasure, addMark, saveAnnot, portScan, geoLocateIp, shodanArea, host]);

  const prompt = pt
    ? `สแกนพอร์ตและบริการของ ${host || "(target)"} (พิกัด ${fmt(pt.lat)}, ${fmt(pt.lon)}) แล้วรายงานพอร์ตที่เปิด`
    : "";

  return (
    <div className="smap-wrap">
      {/* Search bar */}
      <div className="lf-search">
        <Icon name="search" className="lf-search-ico" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="ค้นหา: สถานที่ (ไทย/EN) · พิกัดทหาร MGRS เช่น 47P PR 65931 20229 · lat,lon 13.75,100.5 · เบอร์โทร"
          autoComplete="off"
          spellCheck={false}
        />
        {searching && <span className="lf-search-spin">…</span>}
        {hits.length > 0 && (
          <ul className="lf-results">
            {hits.map((h, i) => (
              <li key={i} onClick={() => gotoHit(h)} className={h.phone ? "is-phone" : ""}>
                <b>{h.phone && <Icon name="phone" className="lf-res-ico" />}{h.label.split(",")[0]}</b>
                <span>{h.phone && <Icon name="warn" className="lf-res-warn" />}{h.sub ?? h.label.split(",").slice(1).join(",").trim()}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* AI natural-language command bar */}
      <div className="lf-ai">
        <span className="lf-ai-badge"><Icon name="bot" /> AI</span>
        <input
          value={aiCmd}
          onChange={(e) => setAiCmd(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !aiBusy) { e.preventDefault(); runAiCommand(); } }}
          placeholder='สั่งไทยได้ เช่น "สแกนพอร์ต 80,443 ของ 8.8.8.8" · "หา host ในมอสโก" (Shodan) · "ลากเส้นกรุงเทพไปเชียงใหม่" · "ล้าง"'
          autoComplete="off"
          spellCheck={false}
          disabled={aiBusy}
        />
        <button type="button" className="btn btn-sm btn-danger" onClick={runAiCommand} disabled={aiBusy}>
          {aiBusy ? "กำลังทำ..." : <>สั่ง <Icon name="send" /></>}
        </button>
      </div>
      {aiMsg && <p className={`lf-ai-msg ${aiBusy ? "busy" : ""}`}>{aiMsg}</p>}

      <div ref={stageRef} className={`smap-stage ${isFs ? "is-fs" : ""}`}>
        <div ref={elRef} className="lf-map lf-theme-dark" />

        {/* Tactical HUD overlay (purely decorative, never blocks the map) */}
        <div className="lf-hud" aria-hidden="true">
          <span className="lf-corner tl" /><span className="lf-corner tr" />
          <span className="lf-corner bl" /><span className="lf-corner br" />
          <span className="lf-reticle" />
          <span className="lf-sweep" />
          <span className="lf-scanline" />
        </div>

        {/* Tool modes */}
        <div className="lf-tools">
          <button type="button" className={`btn btn-sm ${mode === "scan" ? "" : "btn-ghost"}`} onClick={() => setMode("scan")}><Icon name="target" /> ล็อกเป้า</button>
          <button type="button" className={`btn btn-sm ${mode === "mark" ? "" : "btn-ghost"}`} onClick={() => setMode("mark")}><Icon name="pin" /> มาร์คจุด</button>
          <button type="button" className={`btn btn-sm ${mode === "measure" ? "" : "btn-ghost"}`} onClick={() => setMode("measure")}><Icon name="ruler" /> วัดระยะ</button>
          <span className="lf-sep" />
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => setLayer((l) => (l === "dark" ? "sat" : "dark"))}>
            {layer === "dark" ? <><Icon name="globe" /> ดาวเทียม</> : <><Icon name="moon" /> มืด</>}
          </button>
          {layer === "sat" && PROVIDERS.length > 1 && (
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={() => setSatProvider((p) => PROVIDERS[(PROVIDERS.indexOf(p) + 1) % PROVIDERS.length])}
              title="สลับแหล่งภาพดาวเทียม (คมสุด: Google)"
            >
              <Icon name="globe" /> {satProvider === "google" ? "Google" : satProvider === "mapbox" ? "Mapbox" : "Esri"}
            </button>
          )}
          {layer === "sat" && (
            <button type="button" className={`btn btn-sm ${showLabels ? "" : "btn-ghost"}`} onClick={() => setShowLabels((s) => !s)}>
              <Icon name="tag" /> ชื่อถนน {showLabels ? "เปิด" : "ปิด"}
            </button>
          )}
          <button type="button" className="btn btn-sm" onClick={locate} disabled={locating}>
            <Icon name="locate" /> {locating ? "กำลังหา..." : "ตำแหน่งฉัน"}
          </button>
          <span className="lf-sep" />
          <button type="button" className="btn btn-sm btn-ghost" onClick={toggleFullscreen}>{isFs ? <><Icon name="minimize" /> ออก</> : <><Icon name="expand" /> เต็มจอ</>}</button>
          <button type="button" className="btn btn-sm btn-ghost" onClick={exportGeoJSON} disabled={!hasData}><Icon name="download" /> GeoJSON</button>
        </div>

        {/* Zoom + reset */}
        <div className="smap-controls">
          <button type="button" className="btn btn-sm" onClick={() => map.current?.zoomIn()} aria-label="Zoom in"><Icon name="plus" /></button>
          <button type="button" className="btn btn-sm" onClick={() => map.current?.zoomOut()} aria-label="Zoom out"><Icon name="minus" /></button>
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => map.current?.setView([13.75, 100.5], 3)}>RESET</button>
          <span className="smap-zoom">z{zoom}</span>
        </div>

        {/* Live cursor coordinate HUD — lat/lon plus military grid (MGRS) */}
        <div className="lf-coordhud">
          <span className="lf-coordhud-k">LAT/LON</span>
          <span ref={cursorRef} className="lf-coordhud-v">—</span>
          <span className="lf-coordhud-k">MGRS</span>
          <span ref={mgrsRef} className="lf-coordhud-v">—</span>
        </div>

        {locMsg && <div className="lf-readout lf-readout-err">{locMsg}</div>}
        {accuracy != null && !locMsg && (
          <div className="lf-readout lf-readout-gps">
            <Icon name="locate" /> ความแม่นยำ ±{accuracy < 1000 ? `${accuracy.toFixed(0)} ม.` : `${(accuracy / 1000).toFixed(1)} กม.`}
            <button type="button" className="lf-mini" onClick={() => {
              setAccuracy(null);
              if (meMarker.current) { map.current?.removeLayer(meMarker.current); meMarker.current = null; }
              if (meCircle.current) { map.current?.removeLayer(meCircle.current); meCircle.current = null; }
            }}>ซ่อน</button>
          </div>
        )}

        {/* Live readout for the active tool */}
        {mode === "measure" && (
          <div className="lf-readout">
            ระยะรวม: <b>{kmLabel(measureM)}</b> · {measurePts.current.length} จุด
            <button type="button" className="lf-mini" onClick={clearMeasure}><Icon name="trash" /> ล้าง</button>
          </div>
        )}
        {mode === "mark" && markCount > 0 && (
          <div className="lf-readout">
            มาร์คไว้ <b>{markCount}</b> จุด · คลิกขวาที่หมุดเพื่อลบ
            <button type="button" className="lf-mini" onClick={clearMarks}><Icon name="trash" /> ล้างทั้งหมด</button>
          </div>
        )}
      </div>

      <p className="lf-hint-mode">
        {mode === "scan" && "คลิกบนแผนที่เพื่อล็อกพิกัดเป้าหมาย แล้วกรอก IP/host ด้านล่างเพื่อสแกน"}
        {mode === "mark" && "คลิกเพื่อปักหมุด · ลากหมุดเพื่อย้าย · คลิกขวาที่หมุดเพื่อลบ"}
        {mode === "measure" && "คลิกต่อเนื่องเพื่อลากเส้นวัดระยะทาง · แสดงระยะสะสม/ช่วง และทิศ (°)"}
        <span className="lf-keys"><Icon name="keyboard" /> 1 ล็อกเป้า · 2 มาร์ค · 3 วัดระยะ · L ตำแหน่งฉัน · B ดาวเทียม · F เต็มจอ · +/− ซูม</span>
      </p>

      {/* Scan form — unchanged integration with the server action */}
      <form action={action} className="form smap-form">
        <input type="hidden" name="agent" value="RECON-1" />
        <input type="hidden" name="orchestrate" value="" />
        <input type="hidden" name="prompt" value={prompt} />
        <input type="hidden" name="scopeLabel" value={pt ? `MAP ${fmt(pt.lat)},${fmt(pt.lon)}` : ""} />
        <input type="hidden" name="scopeTargets" value={host} />

        <div className="smap-coord">
          {pt ? (
            <>
              พิกัดที่ล็อก: <b>{fmt(pt.lat)}°, {fmt(pt.lon)}°</b> · MGRS <b>{mgrsStr(pt.lat, pt.lon)}</b>
              <button type="button" className="lf-mini" onClick={copyCoord}><Icon name="copy" /> คัดลอก</button>
            </>
          ) : "เลือกโหมด ล็อกเป้า แล้วคลิกบนแผนที่เพื่อล็อกพิกัด"}
        </div>

        <label className="field">
          <span>เป้าหมายที่อนุญาต (IP / host) — ใช้สแกนจริง</span>
          <input value={host} onChange={(e) => setHost(e.target.value)} placeholder="เช่น 10.10.10.5 หรือ app.lab.local หรือ 127.0.0.1" autoComplete="off" />
        </label>

        {/* OSINT: geolocate the IP/host (DNS + geo-IP DB) and pin it. No scan. */}
        <div className="smap-geo">
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => geoLocateIp()} disabled={geoBusy || !host.trim()}>
            <Icon name="locate" /> {geoBusy ? "กำลังหา..." : "ปักหมุดตำแหน่ง IP/host นี้"}
          </button>
          {geoMsg && <span className="smap-geo-msg">{geoMsg}</span>}
        </div>

        {/* ACTIVE recon: nmap TCP port + service scan of the target host. */}
        <div className="smap-geo">
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => portScan(false)} disabled={scanBusy || !host.trim()}>
            <Icon name="target" /> {scanBusy ? "กำลังสแกน..." : "สแกนพอร์ต (Nmap · top 100)"}
          </button>
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => portScan(true)} disabled={scanBusy || !host.trim()}>
            top 1000
          </button>
          {scanMsg && <span className="smap-geo-msg">{scanMsg}</span>}
        </div>

        {ports && ports.length > 0 && (
          <div className="smap-ports">
            <table>
              <thead><tr><th>พอร์ต</th><th>บริการ</th><th>เวอร์ชัน</th></tr></thead>
              <tbody>
                {ports.map((p) => (
                  <tr key={`${p.proto}-${p.port}`}>
                    <td className="smap-port">{p.port}/{p.proto}</td>
                    <td>{p.service || "—"}</td>
                    <td className="smap-ver">{p.version || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="form-foot">
          <button type="submit" className="btn btn-danger" disabled={pending || !pt || !host}>
            {pending ? "กำลังส่ง..." : "ล็อกเป้า + สแกน"}
          </button>
          <Link href="/command" className="btn btn-ghost">← กลับหน้าสั่งการ</Link>
          {state && !state.ok && <span className="launcher-msg bad">{state.message}</span>}
        </div>

        {state?.ok && state.id && (
          <Link href={`/runs/${state.id}`} className="btn btn-success result-btn">
            <span className="result-check" aria-hidden="true"><Icon name="check" /></span>
            <span className="result-body">
              <span className="result-label">สั่งงานแล้ว</span>
              <span className="result-run">run #{state.id}</span>
            </span>
            <span className="result-go">เปิดดูผล →</span>
          </Link>
        )}
      </form>

      <p className="hint">
        พิกัดบนแผนที่ใช้เล็งเป้าเชิงภาพ ระบบสแกนเฉพาะ <b>IP/host ที่ระบุและอยู่ในขอบเขตที่อนุญาต</b> เท่านั้น ไม่ได้สแกนพื้นที่ภูมิศาสตร์แบบสุ่มทั่วโลก
      </p>
    </div>
  );
}

/** Build a themed div-icon pin (avoids Leaflet's bundled image-path issues). */
function pinIcon(leaflet: typeof LType, kind: "scan" | "mark" | "search" | "me"): LType.DivIcon {
  return leaflet.divIcon({
    className: `lf-pin lf-pin-${kind}`,
    html: '<span class="lf-pin-dot"></span><span class="lf-pin-pulse"></span>',
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}
