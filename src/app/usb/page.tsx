// USB Lab page — USB device enumeration and inspection for AGI Research.

import { PageFrame, PageHero, Shell } from "@/components/hud/Shell";
import { UsbLab } from "./UsbLab";

export const metadata = { title: "AGI Research // USB Lab" };

export default function UsbPage() {
  return (
    <Shell label="AGI Research // Loading USB Lab">
      <PageFrame title="AGI Research // USB Lab" online>
        <PageHero
          kicker="AGI RESEARCH // USB HARDWARE RECON"
          title="USB"
          strong="Lab"
          note="OFFLINE RESILIENT · AUTHORIZED RESEARCH"
        />
        <UsbLab />
      </PageFrame>
    </Shell>
  );
}