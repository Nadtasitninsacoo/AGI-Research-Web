/**
 * Live "working" signal: a scrolling oscilloscope/ECG trace with a sweeping
 * beam and a blinking LED. Drop it in while an async action runs. The waveform
 * is one motif (80 user-units wide, net-zero vertically) tiled 7×, scrolled by
 * exactly one motif so the loop is seamless.
 */
const MOTIF = "h24 l4 -12 l4 24 l4 -16 l4 4 h16 l4 -20 l4 28 l4 -8 h12";
const WAVE = "M0 20 " + Array(7).fill(MOTIF).join(" ");

export function SignalScan({ label = "WORKING", note }: { label?: string; note?: string }) {
  return (
    <div className="sig" role="status" aria-label={label}>
      <span className="sig-label"><i className="sig-led" />{label}</span>
      <div className="sig-wave">
        <svg viewBox="0 0 480 40" preserveAspectRatio="none" aria-hidden="true">
          <g className="sig-g"><path className="sig-path" d={WAVE} /></g>
        </svg>
      </div>
      {note && <span className="sig-note">{note}</span>}
    </div>
  );
}
