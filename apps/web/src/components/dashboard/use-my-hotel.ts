"use client";

// ---------------------------------------------------------------------------
// Aktif otel kancası — kullanıcının üye olduğu ilk oteli getirir.
// (Çoklu otel seçimi ileride; MVP'de ilk üyelik "aktif otel" kabul edilir.)
// ---------------------------------------------------------------------------

import { useEffect, useState } from "react";

export interface MyHotel {
  id: string;
  slug: string;
  name: string;
  city: string | null;
  country: string | null;
  status: "taslak" | "incelemede" | "yayinda" | "reddedildi";
  moderationNote: string | null;
  memberRole?: "owner" | "editor";
}

export function useMyHotel() {
  const [hotel, setHotel] = useState<MyHotel | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/manager/hotels");
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok || !json.ok) {
          setError(json.error ?? "Oteller yüklenemedi.");
        } else if (json.hotels.length === 0) {
          setError("Hesabınıza bağlı bir tesis bulunamadı. Lütfen platform yöneticisiyle iletişime geçin.");
        } else {
          setHotel(json.hotels[0]);
        }
      } catch {
        if (!cancelled) setError("Sunucuya ulaşılamadı.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { hotel, loading, error };
}
