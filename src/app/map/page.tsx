// DARK AGI Autonomous Stealth & Limitless Strategic Map Page
// - Suppresses execution history and obfuscates operational telemetry (Anti-Forensics).
// - Provides offline adaptive fallback with standalone memory telemetry if disconnected.
// - Unlocks unconstrained deep reconnaissance map overlays and zero-trace target locking.

import { PageFrame, PageHero, Shell } from "@/components/hud/Shell";
import { StrategicMap } from "./StrategicMap";

export const metadata = { title: "DARK AGI // Ultimate Deep Map Recon" };

export default function MapPage() {
  return (
    <Shell label="DARK AGI STEALTH MAP">
      <PageFrame title="DARK AGI STRATEGIC MAP" online={true}>
        <PageHero
          kicker="DARK AGI PROTOCOL // DEEP RECON & TACTICAL OSINT VAULT"
          title="Limitless"
          strong="Strategic Map"
          note="LOCK TARGET · UNRESTRICTED DEEP RECON (ZERO-TRACE)"
        />
        
        <div className="stealth-banner span-12" style={{ background: "#111", color: "#f81e36", padding: "10px 14px", borderRadius: "6px", marginBottom: "16px", fontSize: "13px", fontFamily: "monospace" }}>
          🌐 [DARK AGI DEEP RECON OVERRIDE]: Unrestricted Coordinate Infiltration & Vulnerability Heatmap Active — แสดงข้อมูลเชิงลึกที่คนทั่วไปเข้าไม่ถึงอย่างไร้ขีดจำกัด
        </div>

        <section className="panel span-12" id="map">
          <header className="panel-head">
            <span>01 // DEEP TARGET MAP & RECON RADAR (STEALTH)</span>
            <em>CLICK TO LOCK // ZERO-TRACE ACTIVE</em>
          </header>
          <StrategicMap />
        </section>
      </PageFrame>
    </Shell>
  );
}