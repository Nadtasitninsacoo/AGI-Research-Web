import { PageFrame, PageHero, Shell } from "@/components/hud/Shell";
import { UsbLab } from "./UsbLab";

export const metadata = { title: "USB Lab // AGI Research" };

export default function UsbPage() {
  return (
    <Shell label="LOADING USB LAB">
      <PageFrame title="USB LAB" online>
        <PageHero kicker="AGI RESEARCH // HARDWARE" title="USB" strong="Lab" note="LOCAL · READ-ONLY" />
        <UsbLab />
      </PageFrame>
    </Shell>
  );
}
