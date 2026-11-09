"use client";

import { useRouter } from "next/navigation";

/** Mobil sıralama seçimi — seçilince ilgili sıralama bağlantısına gider. */
export function SortSelect({ options, value }: { options: Array<{ value: string; label: string; href: string }>; value: string }) {
  const router = useRouter();
  return (
    <label className="er-sort-select">
      <span className="er-visually-hidden">Sırala</span>
      <select
        className="er-select"
        value={value}
        onChange={(e) => {
          const next = options.find((o) => o.value === e.target.value);
          if (next) router.push(next.href);
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
