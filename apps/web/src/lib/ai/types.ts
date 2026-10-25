// ---------------------------------------------------------------------------
// AI tur rehberi — yapılandırılmış fiyat / fact kart tipleri
// ---------------------------------------------------------------------------

export type AiFactKind = "verified" | "otel_ifadesi" | "policy";

export interface AiFactCatalogEntry {
  id: string;
  kind: AiFactKind;
  /** Prompt'ta LLM'in seçmesi için kısa ipucu */
  hint: string;
  text: string;
  title?: string;
  /** Liste türü bilgide tek tek öğeler (ör. olanak adları) — sunucu "X var mı?" sorusunu buradan cevaplar. */
  items?: string[];
}

export interface AiFactCard {
  kind: AiFactKind;
  label: string;
  title?: string;
  text: string;
}

export interface AiPriceCardLine {
  label: string;
  value: string;
}

export interface AiPriceCard {
  roomName: string;
  roomSlug: string;
  lines: AiPriceCardLine[];
  priceOnRequest: boolean;
}

export type AiPriceErrorCode =
  | "no_rooms"
  | "room_not_found"
  | "invalid_dates"
  | "past_date"
  | "too_far"
  | "too_long";

/** Fiyatlanan sorgu — misafire "şunu anladım" diye geri söylenir. */
export interface AiPriceQueryEcho {
  roomSlug?: string;
  checkIn?: string;
  checkOut?: string;
  month?: string;
  guestCount?: number;
  childAges?: number[];
  childCount?: number;
}

export interface AiPriceQueryResult {
  ok: boolean;
  cards: AiPriceCard[];
  error?: string;
  errorCode?: AiPriceErrorCode;
  query?: AiPriceQueryEcho;
}

export interface AiFactQueryResult {
  ok: boolean;
  card?: AiFactCard;
  error?: string;
}

export const FACT_KIND_LABELS: Record<AiFactKind, string> = {
  verified: "Doğrulanmış bilgi",
  otel_ifadesi: "Otel ifadesi",
  policy: "Politika",
};
