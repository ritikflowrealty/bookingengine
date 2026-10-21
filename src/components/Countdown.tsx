"use client";

import { useEffect, useState } from "react";

/** Live "3h 12m" / "4m 05s" countdown to `to`; shows "expired" after. */
export function Countdown({ to, className }: { to: string | Date; className?: string }) {
  const target = new Date(to).getTime();
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (now === null) return <span className={className}>&nbsp;</span>;
  const ms = target - now;
  if (ms <= 0) return <span className={className}>expired</span>;
  const h = Math.floor(ms / 3600_000);
  const m = Math.floor((ms % 3600_000) / 60_000);
  const sec = Math.floor((ms % 60_000) / 1000);
  return <span className={className} suppressHydrationWarning>{h ? `${h}h ${m}m` : `${m}m ${String(sec).padStart(2, "0")}s`}</span>;
}
