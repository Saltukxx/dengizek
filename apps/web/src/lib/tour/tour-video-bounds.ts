/**
 * Video piksel alanının container içindeki dikdörtgenini hesaplar.
 * Hotspot (yüzde) konumlarını ekran piksellerine çevirmek için.
 *
 * - "contain": video merkezlenmiş olarak container içine sığar (letterbox).
 * - "cover": video container'ı doldurur; en-boy oranı farklıysa bir eksen
 *   kırpılır ve rect o eksende container dışına taşar (negatif offset).
 *   Oynatıcıdaki <video> `object-fit: cover` kullandığından varsayılan budur.
 */
export type VideoObjectFit = "contain" | "cover";

export function getVideoContentRect(
  containerW: number,
  containerH: number,
  videoIntrinsicW: number,
  videoIntrinsicH: number,
  fit: VideoObjectFit = "cover",
): { left: number; top: number; width: number; height: number } {
  if (containerW <= 0 || containerH <= 0) {
    return { left: 0, top: 0, width: 0, height: 0 };
  }
  if (videoIntrinsicW <= 0 || videoIntrinsicH <= 0) {
    return { left: 0, top: 0, width: containerW, height: containerH };
  }
  const scaleX = containerW / videoIntrinsicW;
  const scaleY = containerH / videoIntrinsicH;
  const scale = fit === "cover" ? Math.max(scaleX, scaleY) : Math.min(scaleX, scaleY);
  const width = scale * videoIntrinsicW;
  const height = scale * videoIntrinsicH;
  const left = (containerW - width) / 2;
  const top = (containerH - height) / 2;
  return { left, top, width, height };
}

export function hotspotPctToStylePosition(
  xPct: number,
  yPct: number,
  contentRect: { left: number; top: number; width: number; height: number },
) {
  return {
    left: contentRect.left + (xPct / 100) * contentRect.width,
    top: contentRect.top + (yPct / 100) * contentRect.height,
  };
}

/**
 * object-fit: cover kırpması sonrası hotspot konumu görünür alanda mı?
 * Kırpılan bölgeye düşen pinler gizlenmeli — yoksa yanlış içeriğin üzerinde
 * asılı kalırlar.
 */
export function isHotspotPositionVisible(
  xPct: number,
  yPct: number,
  contentRect: { left: number; top: number; width: number; height: number },
  containerW: number,
  containerH: number,
): boolean {
  const { left, top } = hotspotPctToStylePosition(xPct, yPct, contentRect);
  return left >= 0 && left <= containerW && top >= 0 && top <= containerH;
}
