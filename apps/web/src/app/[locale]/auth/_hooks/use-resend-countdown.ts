'use client';

import { useEffect, useState } from 'react';

/** Seconds left before another code may be requested; ticks down to 0. */
export function useResendCountdown(initial = 0) {
  const [seconds, setSeconds] = useState(initial);
  useEffect(() => {
    if (seconds <= 0) return;
    const timer = setTimeout(() => setSeconds(s => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [seconds]);
  return { seconds, start: setSeconds };
}
