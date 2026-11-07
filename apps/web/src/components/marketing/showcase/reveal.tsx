"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Ekrana girince bir kez `data-inview` alır; CSS geçişleri buna bağlanır.
 * JS çalışmazsa ya da "hareketi azalt" açıksa içerik zaten görünür kalır
 * (bkz. thermal-marketing.css).
 */
export function Reveal({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Gözlemci yoksa (eski tarayıcı) içerik hemen görünür.
    if (typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    setReady(true);
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { threshold: 0.2, rootMargin: "0px 0px -8% 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={className}
      data-reveal=""
      data-reveal-ready={ready || undefined}
      data-inview={inView || undefined}
    >
      {children}
    </div>
  );
}
