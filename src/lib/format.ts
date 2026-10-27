export const PAGE_SIZE = 20;

/** Fixed-format UTC timestamp, identical on server and client (no hydration drift). */
export const fmtDate = (iso: string | null | undefined) =>
  iso ? `${iso.slice(0, 10)} ${iso.slice(11, 19)}Z` : "—";

export const fmtDuration = (from: string | null, to: string | null) => {
  if (!from || !to) return "—";
  const ms = Date.parse(to) - Date.parse(from);
  if (!Number.isFinite(ms) || ms < 0) return "—";
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
};

export const toPage = (raw: string | string[] | undefined) => {
  const n = Number(Array.isArray(raw) ? raw[0] : raw);
  return Number.isInteger(n) && n >= 1 && n <= 100000 ? n : 1;
};

export const one = (raw: string | string[] | undefined) => (Array.isArray(raw) ? raw[0] : raw);
