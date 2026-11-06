// Status pill — shows the real run/agent status, nothing added.

const TAG: Record<string, string> = {
  succeeded: "succeeded",
  failed: "failed",
  running: "running",
  queued: "queued",
  cancelled: "idle",
  error: "failed",
  paused: "queued",
  idle: "idle",
  retired: "idle",
};

// States that get a blinking status light: running = working, queued = waiting.
const LED = new Set(["running", "queued", "paused"]);

export function StatusTag({ status }: { status?: string }) {
  const value = (status ?? "").trim() || "unknown";
  const kind = TAG[value] ?? "idle";

  return (
    <span className={`tag tag-${kind}`} title={value}>
      {LED.has(value) && (
        <i className={`tag-led tag-led-${kind}`} aria-hidden="true" />
      )}
      {value.toUpperCase()}
    </span>
  );
}
