import { Shell, PageFrame } from "@/components/hud/Shell";
import { RunExecution } from "./RunExecution";

export const metadata = {
  title: "AGI Research // Run Execution",
};

export default function ExecutePage() {
  return (
    <Shell label="AGI RESEARCH // EXECUTION">
      <PageFrame title="RUN EXECUTION" online>
        <RunExecution />
      </PageFrame>
    </Shell>
  );
}