/** Adım `media` alanı + dosya süresi ile klip penceresi (start/end) hesaplar. */
export function getClipStartSec(media: { startSec?: number }): number {
  return Math.max(0, media.startSec ?? 0);
}

/**
 * Pencere sonu. `endSec` yoksa dosya sonu. `d` 0 veya NaN ise yalnızca `endSec` (varsa) döner.
 */
export function getClipEndSec(
  media: { endSec?: number },
  fileDurationSec: number,
): number {
  const d =
    Number.isFinite(fileDurationSec) && fileDurationSec > 0
      ? fileDurationSec
      : 0;
  if (media.endSec != null) {
    if (d > 0) return Math.min(Math.max(0, media.endSec), d);
    return Math.max(0, media.endSec);
  }
  return d;
}

export function clampTimeInWindow(
  t: number,
  start: number,
  end: number,
): number {
  if (!Number.isFinite(t)) return start;
  if (end <= start) return start;
  return Math.min(Math.max(t, start), end);
}

/**
 * Pencere sonunda bir sonraki tura geçis tetikleme (timeupdate) için.
 */
export function isPastClipEnd(
  currentTime: number,
  endSec: number,
  epsilon = 0.12,
): boolean {
  return currentTime + epsilon >= endSec;
}

export function formatTimeLabel(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
