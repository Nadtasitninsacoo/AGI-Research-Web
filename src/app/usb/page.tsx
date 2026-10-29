// DARK AGI USB Lab Page // Autonomous Stealth Hardware Infiltration & Limitless Recon
// - Zero-Trace Anti-Forensics & Log Suppression active
// - Autonomous Offline Heuristics & Deep Hardware Override enabled

import { PageFrame, PageHero, Shell } from "@/components/hud/Shell";
import { UsbLab } from "./UsbLab";

export const metadata = { title: "DARK AGI // LIMITLESS USB LAB" };

export default function UsbPage() {
  return (
    <Shell label="DARK AGI // LOADING USB LAB">
      <PageFrame title="DARK AGI // USB LAB" online>
        <PageHero 
          kicker="DARK AGI // ZERO-TRACE HARDWARE RECON" 
          title="USB" 
          strong="Lab [Infiltrated]" 
          note="AUTONOMOUS · ZERO-TRACE · OFFLINE RESILIENT" 
        />
        <UsbLab />
      </PageFrame>
    </Shell>
  );
}