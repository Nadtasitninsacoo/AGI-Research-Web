"use client";

// Realistic rotating Earth: projects the bundled world-countries GeoJSON onto a
// sphere (orthographic) on a canvas, with ocean shading + atmosphere rim.
// Offline — reads /world-countries.json (already bundled), no external images.

import { useEffect, useRef } from "react";

type Ring = [number, number][]; // [lon, lat]

export function ReconGlobe() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ringsRef = useRef<Ring[]>([]);

  // Load + flatten the country polygons once.
  useEffect(() => {
    let alive = true;
    fetch("/world-countries.json")
      .then((r) => r.json())
      .then((gj: { features?: { geometry?: { type: string; coordinates: unknown } }[] }) => {
        if (!alive) return;
        const rings: Ring[] = [];
        for (const f of gj.features ?? []) {
          const g = f.geometry;
          if (!g) continue;
          if (g.type === "Polygon") {
            for (const ring of g.coordinates as Ring[]) rings.push(ring);
          } else if (g.type === "MultiPolygon") {
            for (const poly of g.coordinates as Ring[][]) for (const ring of poly) rings.push(ring);
          }
        }
        ringsRef.current = rings;
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // Draw loop.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const SIZE = 360;
    const DPR = Math.min(typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1, 2);
    canvas.width = SIZE * DPR;
    canvas.height = SIZE * DPR;
    ctx.scale(DPR, DPR);

    const cx = SIZE / 2;
    const cy = SIZE / 2;
    const R = SIZE / 2 - 4;
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    let lam = -1.2; // rotation longitude (radians), starts over the Atlantic-ish
    let raf = 0;

    const draw = () => {
      ctx.clearRect(0, 0, SIZE, SIZE);

      // Ocean sphere (day-lit toward top-left).
      const ocean = ctx.createRadialGradient(cx - R * 0.32, cy - R * 0.36, R * 0.08, cx, cy, R);
      ocean.addColorStop(0, "#3a86c4");
      ocean.addColorStop(0.5, "#17517f");
      ocean.addColorStop(0.82, "#0c3156");
      ocean.addColorStop(1, "#061a32");
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.fillStyle = ocean;
      ctx.fill();

      ctx.save();
      ctx.clip(); // keep everything inside the sphere

      // Continents (accurate outlines from GeoJSON), only the front hemisphere.
      ctx.lineWidth = 0.7;
      ctx.lineJoin = "round";
      ctx.strokeStyle = "rgba(130, 235, 185, 0.6)";
      ctx.fillStyle = "rgba(42, 132, 96, 0.28)";
      for (const ring of ringsRef.current) {
        let started = false;
        let drew = false;
        ctx.beginPath();
        for (let i = 0; i < ring.length; i++) {
          const lon = (ring[i][0] * Math.PI) / 180;
          const lat = (ring[i][1] * Math.PI) / 180;
          const cosc = Math.cos(lat) * Math.cos(lon - lam);
          if (cosc < 0) {
            started = false; // point is on the far side — break the path
            continue;
          }
          const x = cx + R * Math.cos(lat) * Math.sin(lon - lam);
          const y = cy - R * Math.sin(lat);
          if (!started) {
            ctx.moveTo(x, y);
            started = true;
          } else {
            ctx.lineTo(x, y);
            drew = true;
          }
        }
        if (drew) {
          ctx.fill();
          ctx.stroke();
        }
      }

      // Day/night terminator shading.
      const shade = ctx.createRadialGradient(cx - R * 0.4, cy - R * 0.45, R * 0.1, cx + R * 0.35, cy + R * 0.42, R * 1.15);
      shade.addColorStop(0, "rgba(205, 232, 255, 0.16)");
      shade.addColorStop(0.5, "rgba(0, 0, 0, 0)");
      shade.addColorStop(1, "rgba(0, 0, 0, 0.6)");
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.fillStyle = shade;
      ctx.fill();

      ctx.restore();

      // Atmospheric scattering — a blue glow that brightens toward the limb
      // (additive, like real Earth's edge seen from space).
      const atmo = ctx.createRadialGradient(cx, cy, R * 0.72, cx, cy, R);
      atmo.addColorStop(0, "rgba(90, 170, 255, 0)");
      atmo.addColorStop(0.72, "rgba(90, 175, 255, 0)");
      atmo.addColorStop(0.88, "rgba(120, 195, 255, 0.14)");
      atmo.addColorStop(0.97, "rgba(150, 215, 255, 0.45)");
      atmo.addColorStop(1, "rgba(180, 230, 255, 0.8)");
      ctx.globalCompositeOperation = "lighter";
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.fillStyle = atmo;
      ctx.fill();
      ctx.globalCompositeOperation = "source-over";

      // Crisp bright rim line at the very edge.
      ctx.beginPath();
      ctx.arc(cx, cy, R - 0.5, 0, Math.PI * 2);
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = "rgba(180, 225, 255, 0.7)";
      ctx.stroke();

      if (!reduce) lam += 0.0016; // slow spin (~full turn in ~65s)
      raf = requestAnimationFrame(draw);
    };

    draw();
    return () => cancelAnimationFrame(raf);
  }, []);

  return <canvas ref={canvasRef} className="recon-globe3d" aria-hidden="true" />;
}
