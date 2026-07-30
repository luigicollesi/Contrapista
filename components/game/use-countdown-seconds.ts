"use client";

import { useEffect, useState } from "react";

export function useNow(intervalMs: number, active = true) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!active) {
      return;
    }

    const interval = window.setInterval(() => setNow(Date.now()), intervalMs);

    return () => window.clearInterval(interval);
  }, [active, intervalMs]);

  return now;
}

export function useCountdownSeconds(endsAt: number | null, intervalMs = 250) {
  const now = useNow(intervalMs, endsAt !== null);

  if (endsAt === null) {
    return null;
  }

  return Math.max(0, Math.ceil((endsAt - now) / 1000));
}
