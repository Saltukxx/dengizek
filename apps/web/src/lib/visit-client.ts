"use client";

// ---------------------------------------------------------------------------
// Anonim ziyaret kimliği — tarayıcı sekmesi başına rastgele UUID.
//
// sessionStorage'da durur: sekme kapanınca biter, başka ziyaretle birleşmez.
// İsim, IP ya da e-posta içermez; yalnızca aynı ziyaretin soru, tur ve talep
// olaylarını birbirine bağlamak için kullanılır.
// ---------------------------------------------------------------------------

const STORAGE_KEY = "otelsayfam:ziyaret";
let memoryId: string | null = null;

function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  // Eski tarayıcı: RFC 4122 v4 biçiminde rastgele kimlik.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/** Bu sekmenin ziyaret kimliği; depolama kapalıysa sayfa ömrü boyunca bellekte. */
export function getVisitId(): string | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const stored = window.sessionStorage.getItem(STORAGE_KEY);
    if (stored) return stored;
    const id = newId();
    window.sessionStorage.setItem(STORAGE_KEY, id);
    return id;
  } catch {
    memoryId ??= newId();
    return memoryId;
  }
}
