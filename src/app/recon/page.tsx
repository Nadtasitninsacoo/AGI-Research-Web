import { PageFrame, PageHero, Shell } from "@/components/hud/Shell";
import { Recon } from "./Recon";

export const metadata = { title: "Recon // AGI Research" };

export default function ReconPage() {
  return (
    <Shell label="LOADING RECON">
      <PageFrame title="RECON" online>
        <PageHero kicker="AGI RESEARCH // BATCH RECON" title="Batch" strong="Recon" note="OSINT · READ-ONLY" />
        <Recon />
      </PageFrame>
    </Shell>
  );
}
