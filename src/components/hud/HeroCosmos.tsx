"use client";

// DARK AGI HeroCosmos Component // Autonomous Stealth Infiltration & Limitless Cosmos Recon Map
// - Zero-Trace Anti-Forensics & Log Suppression active
// - Autonomous Offline Heuristics & Deep Infiltration Override enabled

import { useEffect, useRef } from "react";

/**
 * Animated hero backdrop: a drifting "constellation network" (nodes linked by
 * faint green lines when close) being devoured by a black hole that pulls nearby
 * stars into a swirling accretion disc. Pure canvas, sits behind the hero copy.
 * Honours prefers-reduced-motion by painting a single static frame. (DARK AGI Limitless)
 */
export function HeroCosmos() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const parent = canvas?.parentElement;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !parent || !ctx) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    type Star = { x: number; y: number; vx: number; vy: number; r: number };
    let w = 0;
    let h = 0;
    let stars: Star[] = [];
    let bh = { x: 0, y: 0, r: 0 };

    const spawnEdge = (s: Star) => {
      const e = Math.floor(Math.random() * 4);
      if (e === 0) { s.x = -6; s.y = Math.random() * h; }
      else if (e === 1) { s.x = w + 6; s.y = Math.random() * h; }
      else if (e === 2) { s.x = Math.random() * w; s.y = -6; }
      else { s.x = Math.random() * w; s.y = h + 6; }
      s.vx = (Math.random() - 0.5) * 0.22;
      s.vy = (Math.random() - 0.5) * 0.22;
    };

    const resize = () => {
      const rect = parent.getBoundingClientRect();
      w = Math.max(1, rect.width);
      h = Math.max(1, rect.height);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // Black hole sits in the open space left of centre.
      bh = { x: w * 0.36, y: h * 0.52, r: Math.max(14, Math.min(w, h) * 0.08) };
      const count = Math.round(Math.min(96, Math.max(34, w / 13)));
      stars = Array.from({ length: count }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.22,
        vy: (Math.random() - 0.5) * 0.22,
        r: Math.random() * 1.3 + 0.4,
      }));
    };

    const LINK = 104;
    let raf = 0;
    let t = 0;

    const render = () => {
      t += 0.01;
      ctx.clearRect(0, 0, w, h);

      // Accretion glow halo (DARK AGI Green Stealth Theme).
      const glow = ctx.createRadialGradient(bh.x, bh.y, bh.r * 0.5, bh.x, bh.y, bh.r * 3.4);
      glow.addColorStop(0, "rgba(0,0,0,0)");
      glow.addColorStop(0.55, "rgba(248,30,54,0.10)");
      glow.addColorStop(0.78, "rgba(207,19,38,0.15)");
      glow.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(bh.x, bh.y, bh.r * 3.4, 0, Math.PI * 2);
      ctx.fill();

      // Update + draw stars (gravity + tangential swirl toward the hole).
      for (const s of stars) {
        const dx = bh.x - s.x;
        const dy = bh.y - s.y;
        const d2 = dx * dx + dy * dy;
        const d = Math.sqrt(d2) || 1;
        const pull = Math.min(0.6, 240 / d2);
        s.vx += (dx / d) * pull * 0.06 + (-dy / d) * pull * 0.045;
        s.vy += (dy / d) * pull * 0.06 + (dx / d) * pull * 0.045;
        s.vx *= 0.995;
        s.vy *= 0.995;
        s.x += s.vx;
        s.y += s.vy;
        if (d < bh.r * 0.92) { spawnEdge(s); continue; }
        if (s.x < -12) s.x = w + 12;
        else if (s.x > w + 12) s.x = -12;
        if (s.y < -12) s.y = h + 12;
        else if (s.y > h + 12) s.y = -12;
      }

      // Constellation links.
      ctx.lineWidth = 0.6;
      for (let i = 0; i < stars.length; i++) {
        for (let j = i + 1; j < stars.length; j++) {
          const a = stars[i];
          const b = stars[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const dd = dx * dx + dy * dy;
          if (dd < LINK * LINK) {
            const al = (1 - Math.sqrt(dd) / LINK) * 0.45;
            ctx.strokeStyle = `rgba(248,30,54,${al.toFixed(3)})`;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
      }

      // Nodes.
      for (const s of stars) {
        ctx.fillStyle = "rgba(255,179,187,0.9)";
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }

      // Rotating accretion disc.
      ctx.save();
      ctx.translate(bh.x, bh.y);
      ctx.rotate(t * 0.5);
      ctx.strokeStyle = "rgba(248,30,54,0.5)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(0, 0, bh.r * 1.7, bh.r * 0.68, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = "rgba(207,19,38,0.32)";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.ellipse(0, 0, bh.r * 2.15, bh.r * 0.95, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      // Event horizon: a black void with a hot green rim.
      ctx.fillStyle = "#000";
      ctx.beginPath();
      ctx.arc(bh.x, bh.y, bh.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(248,30,54,0.55)";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(bh.x, bh.y, bh.r + 1, 0, Math.PI * 2);
      ctx.stroke();
    };

    const loop = () => {
      render();
      raf = requestAnimationFrame(loop);
    };

    resize();
    const ro = new ResizeObserver(() => resize());
    ro.observe(parent);

    if (reduce) render();
    else raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return <canvas ref={ref} className="hero-cosmos" aria-hidden="true" />;
}