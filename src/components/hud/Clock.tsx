"use client";

import { useEffect, useState } from "react";

export function Clock() {
  const [now, setNow] = useState<string>("--:--:--");

  useEffect(() => {
    const tick = () => setNow(new Date().toLocaleTimeString("en-GB"));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return <span suppressHydrationWarning>{now}</span>;
}
