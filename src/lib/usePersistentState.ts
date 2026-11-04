"use client";

import { useEffect, useRef, useState } from "react";

/**
 * useState that mirrors its value to localStorage, so user selections and
 * toggles survive a page refresh instead of resetting to defaults.
 *
 * - Reads once after mount (never during render) to avoid SSR hydration
 *   mismatches: the first paint uses `initial`, then the stored value is applied.
 * - Every read/write is wrapped in try/catch; storage can be unavailable
 *   (private window, blocked site data) and must never break the page.
 */
export function usePersistentState<T>(
  key: string,
  initial: T,
): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [value, setValue] = useState<T>(initial);
  const hydrated = useRef(false);

  // Load the stored value after mount.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw !== null) {
        setValue(JSON.parse(raw) as T);
      }
    } catch {
      /* storage unavailable — keep the in-memory default */
    }
    hydrated.current = true;
  }, [key]);

  // Persist on change (only after the initial load, so we don't overwrite the
  // stored value with the default before it has been read).
  useEffect(() => {
    if (!hydrated.current) return;
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* storage unavailable — value stays in memory only */
    }
  }, [key, value]);

  return [value, setValue];
}
