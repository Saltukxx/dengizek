"use client";

import Image from "next/image";
import { useRef, useState } from "react";

/**
 * Mobil galeri — parmakla kaydırılan fotoğraflar ve "3 / 12" sayacı.
 * Masaüstünde ızgara galeri kullanılır (CSS ile gizlenir).
 */
export function GalleryRail({ images, name }: { images: Array<{ url: string; caption?: string | null }>; name: string }) {
  const railRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  if (images.length === 0) return null;
  return (
    <div className="er-gallery-rail pb-lift">
      <div
        ref={railRef}
        className="er-gallery-rail-track"
        onScroll={() => {
          const rail = railRef.current;
          if (rail) setIndex(Math.round(rail.scrollLeft / Math.max(1, rail.clientWidth)));
        }}
      >
        {images.map((img, i) => (
          <Image
            key={img.url + i}
            src={img.url}
            alt={img.caption ?? name}
            width={800}
            height={520}
            sizes="100vw"
            priority={i === 0}
          />
        ))}
      </div>
      {images.length > 1 ? (
        <span className="er-gallery-rail-count" aria-live="polite">
          {index + 1} / {images.length}
        </span>
      ) : null}
    </div>
  );
}
