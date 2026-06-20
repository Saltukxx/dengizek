/**
 * object-fit: contain — video piksel alanı, container içinde merkezlenmiş dikdörtgen.
 * Hotspot (yüzde) konumlarını ekran piksellerine çevirmek için.
 */
export function getVideoContentRect(
  containerW: number,
  containerH: number,
  videoIntrinsicW: number,
  videoIntrinsicH: number,
): { left: number; top: number; width: number; height: number } {
  if (containerW <= 0 || containerH <= 0) {
    return { left: 0, top: 0, width: 0, height: 0 };
  }
  if (videoIntrinsicW <= 0 || videoIntrinsicH <= 0) {
    return { left: 0, top: 0, width: containerW, height: containerH };
  }
  const scale = Math.min(
    containerW / videoIntrinsicW,
    containerH / videoIntrinsicH,
  );
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
