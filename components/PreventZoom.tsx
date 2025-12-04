"use client";

import { useEffect } from "react";

export default function PreventZoom() {
  useEffect(() => {
    // Prevent double-tap zoom on iOS Safari
    let lastTouchEnd = 0;
    const handleTouchEnd = (event: TouchEvent) => {
      const now = Date.now();
      if (now - lastTouchEnd <= 300) {
        event.preventDefault();
      }
      lastTouchEnd = now;
    };

    document.addEventListener("touchend", handleTouchEnd, { passive: false });

    return () => {
      document.removeEventListener("touchend", handleTouchEnd);
    };
  }, []);

  return null;
}
