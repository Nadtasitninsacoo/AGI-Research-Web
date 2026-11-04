// USB Lab page — USB device enumeration and inspection for AGI Research.

import { PageFrame, PageHero, Shell } from "@/components/hud/Shell";
import { UsbLab } from "./UsbLab";
import { UsbAuthorizedRecovery } from "./UsbAuthorizedRecovery";

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
        <div className="span-12">
          <UsbAuthorizedRecovery />
        </div>
        <UsbLab />
      </PageFrame>
    </Shell>
  );
}