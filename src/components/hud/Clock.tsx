"use client";

import { useEffect, useState } from "react";

export function Clock() {
  const [now, setNow] = useState<string>("--:--:--");

  useEffect(() => {
    const tick = () => {
      try {
        setNow(new Date().toLocaleTimeString("en-GB"));
      } catch {
        setNow("--:--:--");
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return <span suppressHydrationWarning>{now}</span>;
}
