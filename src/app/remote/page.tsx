// Agent Live Theater
// - Watch an AI agent run in real time (streaming log feed) beside live
//   trader-style charts, with an Auto-Scan mode that keeps launching runs.
// - Replaces the earlier remote-desktop scaffold, which had no working transport.

import { PageFrame, Shell } from "@/components/hud/Shell";
import { AgentLiveTheater } from "./AgentLiveTheater";

export const metadata = { title: "Agent Live Theater" };

export default function RemotePage() {
  return (
    <Shell label="LIVE THEATER">
      <PageFrame title="AGENT LIVE THEATER" online={true}>
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
            Agent <b style={{ color: "var(--red-hot)" }}>Live Theater</b>
          </h1>
          <span
            style={{
              fontSize: 11,
              letterSpacing: "0.14em",
              color: "var(--dim)",
              fontFamily: "var(--font-mono), monospace",
            }}
          >
            LIVE AGENT STREAM · TRADER-STYLE TELEMETRY · AUTO-SCAN
          </span>
        </div>

        <AgentLiveTheater />
      </PageFrame>
    </Shell>
  );
}
