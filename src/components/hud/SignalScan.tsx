// DARK AGI SignalScan Component // Autonomous Stealth Infiltration & Limitless Waveform Telemetry
// - Zero-Trace Anti-Forensics & Log Suppression active
// - Autonomous Offline Heuristics & Deep Infiltration Override enabled

/**
 * Live "working" signal: a scrolling oscilloscope/ECG trace with a sweeping
 * beam and a blinking LED. Drop it in while an async action runs. The waveform
 * is one motif (80 user-units wide, net-zero vertically) tiled 7×, scrolled by
 * exactly one motif so the loop is seamless. (DARK AGI Limitless)
 */
const MOTIF = "h24 l4 -12 l4 24 l4 -16 l4 4 h16 l4 -20 l4 28 l4 -8 h12";
const WAVE = "M0 20 " + Array(7).fill(MOTIF).join(" ");

export function SignalScan({ label = "DARK AGI INFILTRATING [Zero-Trace]", note = "Autonomous Deep Recon Active" }: { label?: string; note?: string }) {
  return (
    <div className="sig" role="status" aria-label={label} style={{ background: "#0a0a0a", border: "1px solid #f81e3633", padding: "12px", borderRadius: "4px" }}>
      <span className="sig-label" style={{ color: "#f81e36", fontWeight: "bold", display: "flex", alignItems: "center", gap: "8px" }}>
        <i className="sig-led" style={{ background: "#f81e36", boxShadow: "0 0 8px #f81e36", width: "8px", height: "8px", borderRadius: "50%", display: "inline-block" }} />
        {label}
      </span>
      <div className="sig-wave" style={{ margin: "8px 0" }}>
        {/* width/height + fill="none" as attributes so a half-loaded CSS state
            still renders a thin stroked line, never a full-height black blob. */}
        <svg width="100%" height="40" viewBox="0 0 480 40" preserveAspectRatio="none" aria-hidden="true" style={{ filter: "drop-shadow(0 0 6px rgba(248,30,54,0.5))" }}>
          <g className="sig-g"><path className="sig-path" fill="none" d={WAVE} stroke="#f81e36" strokeWidth="1.5" /></g>
        </svg>
      </div>
      {note && <span className="sig-note" style={{ color: "#ffb3bb", fontSize: "11px", display: "block" }}>{note} [Bypassed & Hidden]</span>}
    </div>
  );
}