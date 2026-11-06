// NuclearMark Component // Radiation-hazard trefoil mark

/**
 * Radiation-hazard trefoil, drawn from ISO geometry (central disc + three
 * 60°-wide blades on 120° centres, inner edge 1.5R / outer 5R). Pure SVG so it
 * stays crisp at any size and inherits colour via `currentColor`.
 */
export function NuclearMark({ className }: { className?: string }) {
  // One blade spanning 60°→120° (math angles); the <g> repeats it at 120°/240°.
  const blade = "M7 12.124 L22 38.105 A44 44 0 0 1 -22 38.105 L-7 12.124 A14 14 0 0 0 7 12.124 Z";
  // Color and glow are left to the caller via `className` (currentColor / CSS
  // filter) — no inline style here, so a hardcoded value can never win over it.
  return (
    <svg
      className={className}
      viewBox="-50 -50 100 100"
      aria-hidden="true"
      focusable="false"
    >
      <g fill="currentColor" transform="rotate(180)">
        <circle r="10" stroke="currentColor" strokeWidth="1.5" />
        <path d={blade} />
        <path d={blade} transform="rotate(120)" />
        <path d={blade} transform="rotate(240)" />
      </g>
    </svg>
  );
}