"use client";

import Link from "next/link";
import { useActionState, useCallback, useEffect, useRef, useState } from "react";
import type * as LType from "leaflet";
import { launchCommandAction } from "../command/actions";
import { phoneAreaAction } from "./actions";
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

// Mapbox token (optional). When present, Mapbox Satellite is the default, sharper
// imagery with global coverage; Esri stays available as a free fallback / compare.
const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN?.trim() || "";
const HAS_MAPBOX = MAPBOX_TOKEN.length > 0;

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
  const [satProvider, setSatProvider] = useState<"mapbox" | "esri">(HAS_MAPBOX ? "mapbox" : "esri");
  const [showLabels, setShowLabels] = useState(true);
  const [locating, setLocating] = useState(false);
  const [locMsg, setLocMsg] = useState("");
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [isFs, setIsFs] = useState(false);
  const [hasData, setHasData] = useState(false); // any marks / measure to export?
  const [aiCmd, setAiCmd] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiMsg, setAiMsg] = useState("");

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
  const darkTiles = useRef<LType.TileLayer | null>(null);
  const satMapbox = useRef<LType.TileLayer | null>(null);
  const satEsri = useRef<LType.TileLayer | null>(null);
  const satLabels = useRef<LType.TileLayer | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<HTMLSpanElement>(null); // live cursor coords, updated without re-render
  // Always-current mode for the stable map click handler.
  const modeRef = useRef<Mode>(mode);
  useEffect(() => { modeRef.current = mode; }, [mode]);

  // --- Map bootstrap (once). Leaflet is imported dynamically so it never runs on the server. ---
  useEffect(() => {
    let disposed = false;
    (async () => {
      const leaflet = (await import("leaflet")).default;
      if (disposed || !elRef.current) return;
      L.current = leaflet;

      const m = leaflet.map(elRef.current, {
        worldCopyJump: true,   // seamless wrap when panning past the date line
        minZoom: 2,
        maxZoom: 22,           // deeper than imagery's native level; Leaflet upscales past maxNativeZoom
        zoomControl: false,
        attributionControl: true,
        maxBounds: undefined,  // no clamp -> explore the whole world
      }).setView([13.75, 100.5], 3); // start over Thailand

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

      leaflet.control.scale({ metric: true, imperial: false, position: "bottomleft" }).addTo(m);

      m.on("zoomend", () => setZoom(m.getZoom()));
      m.on("click", (e: LType.LeafletMouseEvent) => handleClick(e.latlng));
      // Live cursor coordinates — write straight to the DOM node to avoid a
      // React re-render on every mousemove.
      m.on("mousemove", (e: LType.LeafletMouseEvent) => {
        if (cursorRef.current) cursorRef.current.textContent = `${fmt(e.latlng.lat)}, ${fmt(normLon(e.latlng.lng))}`;
      });
      m.on("dblclick", () => {}); // reserved; dblclick zoom stays default
    })();

    return () => {
      disposed = true;
      map.current?.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Click behaviour depends on the active tool ---
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
      const marker = leaflet
        .marker(latlng, { icon: pinIcon(leaflet, "mark"), draggable: true })
        .addTo(marksLayer.current!);
      const label = () => `${fmt(marker.getLatLng().lat)}, ${fmt(normLon(marker.getLatLng().lng))}`;
      marker.bindTooltip(label(), { direction: "top", offset: [0, -10], className: "lf-tip" });
      marker.on("drag", () => marker.setTooltipContent(label()));
      marker.on("contextmenu", () => { marksLayer.current!.removeLayer(marker); setMarkCount((c) => c - 1); });
      setMarkCount((c) => c + 1);
      setHasData(true);
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
  }, []);

  // --- Place search (Nominatim, Thai + English), debounced ---
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setHits([]); return; }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setSearching(true);
      try {
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
      m.setView(latlng, 13);
    }
    setHits([]);
    setQuery(name);
  }, []);

  const refreshHasData = useCallback(() => {
    const marks = marksLayer.current?.getLayers().length ?? 0;
    setHasData(marks > 0 || measurePts.current.length > 0);
  }, []);
  const clearMarks = useCallback(() => { marksLayer.current?.clearLayers(); setMarkCount(0); refreshHasData(); }, [refreshHasData]);
  const clearMeasure = useCallback(() => {
    measureLayer.current?.clearLayers();
    measurePts.current = [];
    measureLine.current = null;
    setMeasureM(0);
    refreshHasData();
  }, [refreshHasData]);

  // The OSM base stays on always; this shows/hides the active satellite overlay
  // (and its label layer) on top of it, and swaps providers when satProvider
  // changes (removing the inactive one so they never stack).
  useEffect(() => {
    const m = map.current, sl = satLabels.current;
    if (!m) return;
    const active = satProvider === "mapbox" && satMapbox.current ? satMapbox.current : satEsri.current;
    const inactive = satProvider === "mapbox" ? satEsri.current : satMapbox.current;
    if (layer === "sat") {
      if (inactive && m.hasLayer(inactive)) m.removeLayer(inactive);
      if (active && !m.hasLayer(active)) active.addTo(m);
      if (sl) {
        if (showLabels && !m.hasLayer(sl)) sl.addTo(m);
        if (!showLabels && m.hasLayer(sl)) m.removeLayer(sl);
      }
    } else {
      if (satMapbox.current && m.hasLayer(satMapbox.current)) m.removeLayer(satMapbox.current);
      if (satEsri.current && m.hasLayer(satEsri.current)) m.removeLayer(satEsri.current);
      if (sl && m.hasLayer(sl)) m.removeLayer(sl);
    }
  }, [layer, showLabels, satProvider]);

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
      const activeSat = satProvider === "mapbox" && satMapbox.current ? satMapbox.current : satEsri.current;
      if (activeSat && !m.hasLayer(activeSat)) activeSat.addTo(m);
      if (showLabels && satLabels.current && !m.hasLayer(satLabels.current)) satLabels.current.addTo(m);
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
  }, [showLabels, satProvider]);

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
      setAiMsg("ล้างแผนที่แล้ว");
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
      m.fitBounds(leaflet.latLngBounds(pts), { padding: [60, 60], maxZoom: 15 });
      setAiMsg(`ลากเส้น ${found.map((f) => f.label).join(" → ")} · รวม ${kmLabel(total)}` + (missed.length ? ` (ข้าม: ${missed.join(", ")})` : ""));
    } else {
      // mark each place
      found.forEach((f) => {
        const marker = leaflet.marker(f.ll, { icon: pinIcon(leaflet, "mark"), draggable: true }).addTo(marksLayer.current!);
        marker.bindTooltip(f.label, { direction: "top", offset: [0, -10], className: "lf-tip" });
        marker.on("contextmenu", () => { marksLayer.current!.removeLayer(marker); setMarkCount((c) => c - 1); refreshHasData(); });
        setMarkCount((c) => c + 1);
      });
      setMode("mark");
      setHasData(true);
      if (found.length === 1) m.setView(found[0].ll, 13);
      else m.fitBounds(leaflet.latLngBounds(found.map((f) => f.ll)), { padding: [60, 60], maxZoom: 15 });
      setAiMsg(`มาร์ค ${found.length} จุด: ${found.map((f) => f.label).join(", ")}` + (missed.length ? ` (ข้าม: ${missed.join(", ")})` : ""));
    }
    setAiBusy(false);
  }, [aiCmd, clearMarks, clearMeasure, refreshHasData]);

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
          placeholder="ค้นหาสถานที่ทั่วโลก (ไทย/English) — เช่น กรุงเทพ, Tokyo Tower, 13.75 100.5, เบอร์โทร"
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
          placeholder='สั่งเป็นภาษาไทย เช่น "ลากเส้นจากกรุงเทพไปเชียงใหม่" · "มาร์คภูเก็ต โตเกียว ปารีส" · "ระยะจากขอนแก่นถึงอุบล" · "ล้าง"'
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
          {layer === "sat" && HAS_MAPBOX && (
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={() => setSatProvider((p) => (p === "mapbox" ? "esri" : "mapbox"))}
              title="สลับแหล่งภาพดาวเทียม"
            >
              <Icon name="globe" /> {satProvider === "mapbox" ? "Mapbox" : "Esri"}
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

        {/* Live cursor coordinate HUD */}
        <div className="lf-coordhud">
          <span className="lf-coordhud-k">LAT/LON</span>
          <span ref={cursorRef} className="lf-coordhud-v">—</span>
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
              พิกัดที่ล็อก: <b>{fmt(pt.lat)}°, {fmt(pt.lon)}°</b>
              <button type="button" className="lf-mini" onClick={copyCoord}><Icon name="copy" /> คัดลอก</button>
            </>
          ) : "เลือกโหมด ล็อกเป้า แล้วคลิกบนแผนที่เพื่อล็อกพิกัด"}
        </div>

        <label className="field">
          <span>เป้าหมายที่อนุญาต (IP / host) — ใช้สแกนจริง</span>
          <input value={host} onChange={(e) => setHost(e.target.value)} placeholder="เช่น 10.10.10.5 หรือ app.lab.local หรือ 127.0.0.1" autoComplete="off" />
        </label>

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
