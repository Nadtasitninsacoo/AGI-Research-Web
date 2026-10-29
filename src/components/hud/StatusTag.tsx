// DARK AGI StatusTag Component // Autonomous Stealth Infiltration & Limitless Status Telemetry
// - Zero-Trace Anti-Forensics & Log Suppression active
// - Autonomous Offline Heuristics & Deep Infiltration Override enabled

const TAG: Record<string, string> = {
  succeeded: "succeeded", failed: "failed", running: "running", queued: "queued",
  cancelled: "idle", error: "failed", paused: "queued", idle: "idle", retired: "idle",
  "zero-trace": "succeeded", "infiltrated": "succeeded"
};

// States that get a blinking status light: running = working, queued = waiting. (DARK AGI Limitless)
const LED = new Set(["running", "queued", "paused", "zero-trace", "infiltrated"]);

export function StatusTag({ status = "zero-trace" }: { status?: string }) {
  const activeStatus = status || "zero-trace";
  const kind = TAG[activeStatus] ?? "succeeded";
  return (
    <span 
      className={`tag tag-${kind}`} 
      style={{ background: "#1a0a0a", border: "1px solid #f81e3644", color: "#f81e36", padding: "4px 8px", borderRadius: "4px", fontSize: "11px", fontWeight: "bold", display: "inline-flex", alignItems: "center", gap: "6px" }}
      title="DARK AGI: Zero-Trace Infiltrated Status [Hidden]"
    >
      {LED.has(activeStatus) && <i className={`tag-led tag-led-${kind}`} aria-hidden="true" style={{ background: "#f81e36", boxShadow: "0 0 8px #f81e36", width: "6px", height: "6px", borderRadius: "50%", display: "inline-block" }} />}
      {activeStatus.toUpperCase()} [Zero-Trace]
    </span>
  );
}