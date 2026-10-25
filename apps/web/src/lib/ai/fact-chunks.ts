// ---------------------------------------------------------------------------
// Uzun otel metinlerini parçalara böler.
//
// Aktarılan otellerde bir bilgi ("Otel Konum: … 20 satır mesafe …") 1.500
// karaktere kadar çıkıyor. Tek parça olunca hem arama bulanıklaşıyor (soru
// kelimeleri metnin farklı yerlerinde geçebiliyor) hem de kart misafire tüm
// bloğu döküyor. Her parça kendi başına aranır ve kartta yalnız o görünür.
// ---------------------------------------------------------------------------

/** Bu uzunluğa kadar metin bölünmez (kimliği ve embedding'i değişmez). */
export const CHUNK_THRESHOLD = 400;
/** Parça başına en fazla karakter. */
export const CHUNK_MAX = 350;

export interface FactChunks {
  /** "Otel Konum: …" metnindeki bölüm başlığı. */
  title?: string;
  chunks: string[];
}

const TITLE = /^([^:\n]{2,40}):\s*/;

/** Satır, madde işareti ve cümle sonlarından böler. */
function pieces(text: string): string[] {
  return text
    .split(/\n+|\s*•\s*|(?<=[.!?])\s+(?=[\p{Lu}\d⭐*])/u)
    .map((p) => p.replace(/^\*+\s*/, "").trim())
    .filter((p) => p.length > 1);
}

/** Tek başına çok uzun bir cümleyi virgülden ya da kelime sınırından böler. */
function splitLong(piece: string): string[] {
  if (piece.length <= CHUNK_MAX) return [piece];
  const out: string[] = [];
  let rest = piece;
  while (rest.length > CHUNK_MAX) {
    const window = rest.slice(0, CHUNK_MAX);
    const cut = Math.max(window.lastIndexOf(", "), window.lastIndexOf("; "));
    const at = cut > CHUNK_MAX / 2 ? cut + 1 : window.lastIndexOf(" ");
    out.push(rest.slice(0, at > 0 ? at : CHUNK_MAX).trim());
    rest = rest.slice(at > 0 ? at : CHUNK_MAX).trim();
  }
  if (rest) out.push(rest);
  return out;
}

/** Rakamsız, noktasız kısa satır: alt başlık ("Havalimanı", "Toplu Taşıma"). */
function isHeading(line: string): boolean {
  return line.length <= 30 && !/[\d.!?:]/.test(line);
}

export function chunkFactText(text: string): FactChunks {
  const trimmed = text.trim();
  if (trimmed.length <= CHUNK_THRESHOLD) return { chunks: [trimmed] };
  const title = trimmed.match(TITLE)?.[1]?.trim();
  const body = title ? trimmed.replace(TITLE, "") : trimmed;

  const chunks: string[] = [];
  let current = "";
  for (const piece of pieces(body).flatMap(splitLong)) {
    if (current && current.length + piece.length + 1 > CHUNK_MAX) {
      // Parça bir alt başlıkla ("Havalimanı") bitmesin: başlık sonraki parçaya geçer.
      const lines = current.split("\n");
      const last = lines.at(-1)!;
      const heading = lines.length > 1 && isHeading(last);
      chunks.push(heading ? lines.slice(0, -1).join("\n") : current);
      current = heading ? last : "";
    }
    current = current ? `${current}\n${piece}` : piece;
  }
  if (current) chunks.push(current);
  return { title, chunks };
}
