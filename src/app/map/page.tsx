// Strategic Map page
// - Hosts the interactive recon map (search, geolocate, port/exposure lookups).

import { PageFrame, Shell } from "@/components/hud/Shell";
import { StrategicMap } from "./StrategicMap";
import { MapAutoAgent } from "./MapAutoAgent";

export const metadata = { title: "Strategic Map" };

export default function MapPage() {
  return (
    <Shell label="STRATEGIC MAP">
      <PageFrame title="STRATEGIC MAP" online={true}>
        {/* Compact single-row header to save vertical space. */}
        <div
          className="span-12"
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: 12,
            flexWrap: "wrap",
            marginBottom: 12,
          }}
        >
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, letterSpacing: "0.01em" }}>
            Strategic <b style={{ color: "var(--red-hot)" }}>Map</b>
          </h1>
          <span
            style={{
              fontSize: 11,
              letterSpacing: "0.14em",
              color: "var(--dim)",
              fontFamily: "var(--font-mono), monospace",
            }}
          >
            MAP RECON & OSINT · target coordinates, geolocation, exposure
          </span>
        </div>

        <div className="span-12">
          <MapAutoAgent />
        </div>

        <section className="panel span-12" id="map">
          <header className="panel-head">
            <span>01 // TARGET MAP & RECON RADAR</span>
            <em>CLICK TO LOCK</em>
          </header>
          <StrategicMap />
        </section>
      </PageFrame>
    </Shell>
  );
}