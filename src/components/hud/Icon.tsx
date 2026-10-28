const PATHS = {
  overview: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM12 1v4M12 19v4M1 12h4M19 12h4",
  agents: "M12 3l8 4.5v9L12 21l-8-4.5v-9zM12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z",
  runs: "M2 12h5l3-8 4 16 3-8h5",
  bench: "M5 20V11M11 20V4M17 20v-6M2 20h20",
  logs: "M4 6h16M4 12h10M4 18h14",
  command: "M4 4h16v16H4zM7 9l3 3-3 3M13 15h4",
  map: "M9 4L3 7v13l6-3 6 3 6-3V4l-6 3-6-3zM9 4v13M15 7v13",
  nexus: "M12 12a9 9 0 1 0 0 .01zM12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM12 3v4M12 17v4M3 12h4M17 12h4",
  experiments: "M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4A2 2 0 0 0 19 18l-5-9V3",
  datasets: "M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zM4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3",
  settings: "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2",
  glyph: "M12 2l9 5v10l-9 5-9-5V7zM12 7l5 3v4l-5 3-5-3v-4zM12 2v5M21 7l-4 3M3 7l4 3M12 22v-5",
  globe: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c3.5 2.5 3.5 15.5 0 18M12 3c-3.5 2.5-3.5 15.5 0 18",
  scan: "M12 5a7 7 0 1 0 0 14 7 7 0 0 0 0-14M12 2v3M12 19v3M2 12h3M19 12h3M12 10.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3",
  ports: "M8 7V3M16 7V3M6 7h12v3a6 6 0 0 1-12 0zM12 16v5",
  usb: "M12 21V5M12 5l-3 3M12 5l3 3M12 14l-4-2.5V9M8 11.5a1 1 0 1 0 0-.1M12 11l4-2.5 0-1.5M16 6.5l1.5-1.5 1.5 1.5-1.5 1.5z",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
