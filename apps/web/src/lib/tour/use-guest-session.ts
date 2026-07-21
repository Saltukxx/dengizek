"use client";

// ---------------------------------------------------------------------------
// Misafir oturum hafızası — anonim, client-üretilen bir token (localStorage)
// ile "görülen adımlar"ı hatırlar. Kimlik doğrulama yok, kritik hiçbir karar
// buna dayanmaz — yalnızca "Kaldığınız yerden devam edin mi?" UX'i içindir.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useRef, useState } from "react";

const STORAGE_KEY = "dengizek_guest_session";
const PERSIST_DEBOUNCE_MS = 2000;

function getOrCreateSessionToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const existing = window.localStorage.getItem(STORAGE_KEY);
    if (existing) return existing;
    const token = crypto.randomUUID();
    window.localStorage.setItem(STORAGE_KEY, token);
    return token;
  } catch {
    // localStorage kapalı (gizli sekme/gizlilik ayarı) — sessizce özellik dışı kal
    return null;
  }
}

export interface GuestResumeState {
  stepsSeen: string[];
  lastStepId: string | null;
}

export function useGuestSession(hotelSlug: string, tourId: string) {
  const [resumeAvailable, setResumeAvailable] = useState<GuestResumeState | null>(null);
  const tokenRef = useRef<string | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    tokenRef.current = getOrCreateSessionToken();
    if (!tokenRef.current) return;
    const params = new URLSearchParams({ token: tokenRef.current, hotelSlug, tourId });
    fetch(`/api/tour/session?${params.toString()}`)
      .then((r) => r.json())
      .then((json: { ok?: boolean; found?: boolean; stepsSeen?: string[]; lastStepId?: string | null }) => {
        if (json?.ok && json.found && Array.isArray(json.stepsSeen) && json.stepsSeen.length > 0) {
          setResumeAvailable({ stepsSeen: json.stepsSeen, lastStepId: json.lastStepId ?? null });
        }
      })
      .catch(() => {});
    // Yalnızca mount'ta çalışır — hotelSlug/tourId bir tur oturumu boyunca sabittir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(
    () => () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    },
    [],
  );

  const persistProgress = useCallback(
    (stepsSeen: string[], lastStepId: string | null) => {
      if (!tokenRef.current || stepsSeen.length === 0) return;
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = setTimeout(() => {
        void fetch("/api/tour/session", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionToken: tokenRef.current, hotelSlug, tourId, stepsSeen, lastStepId }),
        }).catch(() => {});
      }, PERSIST_DEBOUNCE_MS);
    },
    [hotelSlug, tourId],
  );

  const dismissResume = useCallback(() => setResumeAvailable(null), []);

  return { resumeAvailable, persistProgress, dismissResume };
}
