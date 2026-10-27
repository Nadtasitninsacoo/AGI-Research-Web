const TAG: Record<string, string> = {
  succeeded: "succeeded", failed: "failed", running: "running", queued: "queued",
  cancelled: "idle", error: "failed", paused: "queued", idle: "idle", retired: "idle",
};

// States that get a blinking status light: running = working, queued = waiting.
const LED = new Set(["running", "queued", "paused"]);

export function StatusTag({ status }: { status: string }) {
  const kind = TAG[status] ?? "idle";
  return (
    <span className={`tag tag-${kind}`}>
      {LED.has(status) && <i className={`tag-led tag-led-${kind}`} aria-hidden="true" />}
      {status}
    </span>
  );
}
