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

export interface AiPriceQueryResult {
  ok: boolean;
  cards: AiPriceCard[];
  error?: string;
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
