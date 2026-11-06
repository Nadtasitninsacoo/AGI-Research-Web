// SignalScan Component // Animated "working" waveform indicator

/**
 * Live "working" signal: a scrolling oscilloscope/ECG trace with a sweeping
 * beam and a blinking LED. Drop it in while an async action runs. The waveform
 * is one motif (80 user-units wide, net-zero vertically) tiled 7×, scrolled by
 * exactly one motif so the loop is seamless.
 */
const MOTIF = "h24 l4 -12 l4 24 l4 -16 l4 4 h16 l4 -20 l4 28 l4 -8 h12";
const WAVE = "M0 20 " + Array(7).fill(MOTIF).join(" ");

/**
 * `level` ramps the visual intensity of the waveform/LED — 1 is calm (light
 * job), 4 is the fastest/brightest (heavy job). Purely cosmetic: it does not
 * change how fast the underlying work actually runs.
 */
export function SignalScan({
  label = "WORKING",
  note = "Processing",
  level = 2,
}: {
  label?: string;
  note?: string;
  level?: 1 | 2 | 3 | 4;
}) {
  return (
    <div className={`sig sig-lv${level}`} role="status" aria-label={label}>
      <span className="sig-label">
        <i className="sig-led" />
        {label}
      </span>
      <div className="sig-wave">
        {/* width/height + fill="none" as attributes so a half-loaded CSS state
            still renders a thin stroked line, never a full-height black blob. */}
        <svg width="100%" height="40" viewBox="0 0 480 40" preserveAspectRatio="none" aria-hidden="true">
          <g className="sig-g"><path className="sig-path" fill="none" d={WAVE} strokeWidth="1.5" /></g>
        </svg>
      </div>
      {note && <span className="sig-note">{note}</span>}
    </div>
  );
}