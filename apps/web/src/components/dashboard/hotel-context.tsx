"use client";

// ---------------------------------------------------------------------------
// Aktif otel bağlamı — çoklu tesis desteği; seçim localStorage'da kalır.
// ---------------------------------------------------------------------------

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { panelApi } from "@/lib/panel-api";

export interface MyHotel {
  id: string;
  slug: string;
  name: string;
  city: string | null;
  country: string | null;
  status: "taslak" | "incelemede" | "yayinda" | "reddedildi";
  moderationNote: string | null;
  publishedRevision: number | null;
  draftRevision: number;
  submittedRevision: number | null;
  hasUnpublishedChanges: boolean;
  memberRole?: "owner" | "editor";
}

const STORAGE_KEY = "dengizek-active-hotel-id";

interface HotelContextValue {
  hotels: MyHotel[];
  hotel: MyHotel | null;
  loading: boolean;
  error: string | null;
  selectHotel: (id: string) => void;
  reload: () => Promise<void>;
}

const HotelContext = createContext<HotelContextValue | null>(null);

export function HotelProvider({ children }: { children: ReactNode }) {
  const [hotels, setHotels] = useState<MyHotel[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadHotels = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const json = await panelApi<{ hotels: MyHotel[] }>("/api/manager/hotels");
      if (json.hotels.length === 0) {
        setError(
          "Hesabınıza bağlı bir tesis bulunamadı. Lütfen platform yöneticisiyle iletişime geçin.",
        );
        setHotels([]);
        return;
      }
      setError(null);
      setHotels(json.hotels);

      const stored = localStorage.getItem(STORAGE_KEY);
      const match = json.hotels.find((h: MyHotel) => h.id === stored);
      setSelectedId(match?.id ?? json.hotels[0].id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sunucuya ulaşılamadı.");
      setHotels([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadHotels();
  }, [loadHotels]);

  const selectHotel = useCallback((id: string) => {
    setSelectedId(id);
    localStorage.setItem(STORAGE_KEY, id);
  }, []);

  const hotel = useMemo(
    () => hotels.find((h) => h.id === selectedId) ?? hotels[0] ?? null,
    [hotels, selectedId],
  );

  const value = useMemo(
    () => ({
      hotels,
      hotel,
      loading,
      error,
      selectHotel,
      reload: loadHotels,
    }),
    [hotels, hotel, loading, error, selectHotel, loadHotels],
  );

  return <HotelContext.Provider value={value}>{children}</HotelContext.Provider>;
}

export function useHotelContext() {
  const ctx = useContext(HotelContext);
  if (!ctx) {
    throw new Error("useHotelContext HotelProvider içinde kullanılmalıdır.");
  }
  return ctx;
}

/** Geriye uyumluluk — mevcut bileşenler aynı imzayı korur. */
export function useMyHotel() {
  const { hotel, loading, error, reload } = useHotelContext();
  return { hotel, loading, error, reload };
}
