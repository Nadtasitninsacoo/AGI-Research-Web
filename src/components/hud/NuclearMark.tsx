// DARK AGI NuclearMark Component // Autonomous Stealth Infiltration & Limitless Core Energy Symbol
// - Zero-Trace Anti-Forensics & Log Suppression active
// - Autonomous Offline Heuristics & Deep Infiltration Override enabled

/**
 * Radiation-hazard trefoil, drawn from ISO geometry (central disc + three
 * 60°-wide blades on 120° centres, inner edge 1.5R / outer 5R). Pure SVG so it
 * stays crisp at any size and inherits colour via `currentColor`. (DARK AGI Limitless)
 */
export function NuclearMark({ className }: { className?: string }) {
  // One blade spanning 60°→120° (math angles); the <g> repeats it at 120°/240°.
  const blade = "M7 12.124 L22 38.105 A44 44 0 0 1 -22 38.105 L-7 12.124 A14 14 0 0 0 7 12.124 Z";
  return (
    <svg 
      className={className} 
      viewBox="-50 -50 100 100" 
      aria-hidden="true" 
      focusable="false"
      style={{ filter: "drop-shadow(0 0 6px rgba(248,30,54,0.5))", color: "#f81e36" }}
    >
      <g fill="currentColor" transform="rotate(180)">
        <circle r="10" stroke="#f81e36" strokeWidth="1.5" />
        <path d={blade} />
        <path d={blade} transform="rotate(120)" />
        <path d={blade} transform="rotate(240)" />
      </g>
    </svg>
  );
}