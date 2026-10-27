import { PageFrame, PageHero, Shell } from "@/components/hud/Shell";
import { StrategicMap } from "./StrategicMap";

export const metadata = { title: "Map // AGI Research" };

export default function MapPage() {
  return (
    <Shell label="LOADING MAP">
      <PageFrame title="MAP" online>
        <PageHero kicker="AGI RESEARCH // TACTICAL MAP" title="Strategic" strong="Map" note="LOCK TARGET · SCAN" />
        <section className="panel span-12" id="map">
          <header className="panel-head"><span>01 // TARGET MAP</span><em>CLICK TO LOCK</em></header>
          <StrategicMap />
        </section>
      </PageFrame>
    </Shell>
  );
}
