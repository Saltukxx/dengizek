"use client";

// ---------------------------------------------------------------------------
// Sesli yanıt — rehberin cevaplarını cümle cümle seslendirir.
//
// Cevap akarken tamamlanan her cümle hemen sıraya girer; misafir cevabın
// bitmesini beklemez. Türkçe cümleler kendi sunucumuzdaki Piper ile üretilir
// (/api/voice/speak). Sunucu sesi yoksa ya da hata verirse (yapılandırılmamış,
// kapalı, ağ hatası) o oturumda tarayıcının kendi sesine (speechSynthesis)
// geçilir; İngilizce cümleler doğrudan tarayıcı sesiyle okunur.
//
// Yalnız açıldıktan SONRA gelen cevaplar okunur. Açma düğmesi kullanıcı
// etkileşimi olduğundan sesi orada "kilitten çıkarırız" (iOS/Safari otomatik
// oynatma kuralı); sonraki çalmalar aynı <audio> öğesini kullanır.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useRef, useState } from "react";
import type { GuideMessage } from "@/lib/tour/use-tour-guide";
import { prepareSpeechText, takeSentences } from "@/lib/voice/speech-text";

const STORAGE_KEY = "er-voice-reply";
/** 8 örneklik sessiz WAV — açma düğmesinde sesi kilitten çıkarmak için. */
const SILENT_WAV =
  "data:audio/wav;base64,UklGRjQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YRAAAAAAAAAAAAAAAAAAAAAAAAAA";

/** Noktayla biten ama akışı süren son cümle bu kadar değişmezse okunur. */
const EARLY_SENTENCE_MS = 600;
const SENTENCE_END = /[.!?…]["'”’)\]]*\s*$/;
/** "12." gibi sayının ortası olabilecek sonlar beklenir. */
const NUMBER_END = /\d[.,]\s*$/;

type SpeechLanguage = "tr" | "en";
type Clip = { kind: "audio"; url: string } | { kind: "browser"; text: string; lang: SpeechLanguage } | null;

interface UseSpeechOutputOptions {
  messages: GuideMessage[];
  /** Cevap hâlâ akıyor mu — akarken son cümle yarım olabilir. */
  isThinking: boolean;
  /** Sohbette tespit edilen dil; bilinmiyorsa Türkçe. */
  language?: string;
}

function hasBrowserVoice(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined";
}

function hasAudio(): boolean {
  return typeof window !== "undefined" && typeof window.Audio !== "undefined";
}

function releaseClip(clip: Clip) {
  if (clip?.kind === "audio") URL.revokeObjectURL(clip.url);
}

function saveEnabled(value: boolean) {
  try {
    window.localStorage.setItem(STORAGE_KEY, value ? "1" : "0");
  } catch {
    // Gizli pencere vb. — tercih yalnız bu oturumda kalır.
  }
}

export function useSpeechOutput({ messages, isThinking, language }: UseSpeechOutputOptions) {
  const [enabled, setEnabled] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  /** Sıra her tamamen boşaldığında artar — sesli sohbet "sözü bitti"yi buradan anlar. */
  const [drainCount, setDrainCount] = useState(0);

  const lang: SpeechLanguage = language === "en" ? "en" : "tr";
  const langRef = useRef(lang);
  langRef.current = lang;
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  const audioRef = useRef<HTMLAudioElement | null>(null);
  /** Mesaj id → seslendirmek için tüketilen karakter sayısı (Infinity = hiç okunmayacak). */
  const progressRef = useRef(new Map<string, number>());
  const queueRef = useRef<Promise<Clip>[]>([]);
  const pumpingRef = useRef(false);
  /** stop() her çağrıda artırır; eski kuyruğun işleri bunu görüp durur. */
  const generationRef = useRef(0);
  /** Sunucu sesi bu oturumda çalışıyor mu — bir kez hata verirse tarayıcı sesine geçilir. */
  const serverVoiceRef = useRef(true);
  const finishCurrentRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    setIsSupported(hasAudio() || hasBrowserVoice());
    try {
      if (window.localStorage.getItem(STORAGE_KEY) === "1") {
        markAllSeen();
        setEnabled(true);
      }
    } catch {
      // localStorage erişilemez — varsayılan kapalı.
    }
  }, []);

  /** Ekrandaki mevcut mesajlar okunmaz — yalnız bundan sonra gelenler. */
  function markAllSeen() {
    for (const msg of messagesRef.current) progressRef.current.set(msg.id, Number.POSITIVE_INFINITY);
  }

  const synthesize = useCallback(async (text: string, clipLang: SpeechLanguage, generation: number): Promise<Clip> => {
    if (clipLang === "tr" && serverVoiceRef.current && hasAudio()) {
      try {
        const res = await fetch("/api/voice/speak", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        });
        if (res.ok) {
          const blob = await res.blob();
          if (generation !== generationRef.current) return null;
          return { kind: "audio", url: URL.createObjectURL(blob) };
        }
        // Hız sınırı geçicidir; diğer hatalarda bu oturumda sunucu sesi bırakılır.
        if (res.status !== 429) serverVoiceRef.current = false;
      } catch {
        serverVoiceRef.current = false;
      }
    }
    return hasBrowserVoice() ? { kind: "browser", text, lang: clipLang } : null;
  }, []);

  const play = useCallback((clip: NonNullable<Clip>) => {
    return new Promise<void>((resolve) => {
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        finishCurrentRef.current = null;
        releaseClip(clip);
        resolve();
      };
      finishCurrentRef.current = finish;

      if (clip.kind === "audio") {
        const audio = audioRef.current ?? (audioRef.current = new Audio());
        audio.onended = finish;
        audio.onerror = finish;
        audio.src = clip.url;
        Promise.resolve(audio.play()).catch(finish);
        return;
      }

      const utterance = new SpeechSynthesisUtterance(clip.text);
      utterance.lang = clip.lang === "en" ? "en-US" : "tr-TR";
      const voice = window.speechSynthesis
        .getVoices()
        .find((v) => v.lang.replace("_", "-").toLowerCase().startsWith(clip.lang));
      if (voice) utterance.voice = voice;
      utterance.onend = finish;
      utterance.onerror = finish;
      window.speechSynthesis.speak(utterance);
    });
  }, []);

  const pump = useCallback(async () => {
    if (pumpingRef.current) return;
    pumpingRef.current = true;
    setIsSpeaking(true);
    const generation = generationRef.current;
    try {
      while (queueRef.current.length > 0 && generation === generationRef.current) {
        const clip = await queueRef.current.shift()!;
        if (generation !== generationRef.current) {
          releaseClip(clip);
          break;
        }
        if (clip) await play(clip);
      }
    } finally {
      // stop() kuyruğu zaten sıfırladıysa yeni kuyruğun durumuna dokunulmaz.
      if (generation === generationRef.current) {
        pumpingRef.current = false;
        setIsSpeaking(false);
        setDrainCount((n) => n + 1);
      }
    }
  }, [play]);

  const enqueue = useCallback(
    (raw: string) => {
      const clipLang = langRef.current;
      const text = prepareSpeechText(raw, clipLang);
      if (!/[\p{L}\p{N}]/u.test(text)) return;
      queueRef.current.push(synthesize(text, clipLang, generationRef.current));
      void pump();
    },
    [pump, synthesize],
  );

  /** Sohbette görünmeyen kısa bir söz söyler (ör. sesli sohbette "bakıyorum"). */
  const say = useCallback((text: string) => enqueue(text), [enqueue]);

  /** Okumayı keser ve sırayı boşaltır (yeni soru, mikrofon, kapatma). */
  const stop = useCallback(() => {
    generationRef.current += 1;
    for (const pending of queueRef.current) void pending.then(releaseClip);
    queueRef.current = [];
    pumpingRef.current = false;
    setIsSpeaking(false);
    audioRef.current?.pause();
    finishCurrentRef.current?.();
    if (hasBrowserVoice()) window.speechSynthesis.cancel();
  }, []);

  /** Okuma sürüyor ya da sırada cümle var mı (anlık, render beklemeden). */
  const isBusy = useCallback(() => pumpingRef.current || queueRef.current.length > 0, []);

  /** Sesli yanıtı açar. Kullanıcı etkileşimi içinde çağrılmalı (ses kilidi). */
  const enable = useCallback(() => {
    if (enabled) return;
    markAllSeen();
    // Kullanıcı etkileşimi içinde sesi kilitten çıkar (iOS/Safari).
    try {
      if (hasAudio()) {
        const audio = audioRef.current ?? (audioRef.current = new Audio());
        audio.src = SILENT_WAV;
        Promise.resolve(audio.play()).catch(() => {});
      }
      if (hasBrowserVoice()) window.speechSynthesis.speak(new SpeechSynthesisUtterance(""));
    } catch {
      // Kilit açılamazsa ilk çalma yine denenir.
    }
    setEnabled(true);
    saveEnabled(true);
  }, [enabled]);

  const toggle = useCallback(() => {
    if (!enabled) return enable();
    stop();
    setEnabled(false);
    saveEnabled(false);
  }, [enable, enabled, stop]);

  // Yeni ya da akmakta olan cevaplardan tamamlanan cümleleri sıraya ekle.
  useEffect(() => {
    if (!enabled) return;
    let earlyTimer: ReturnType<typeof setTimeout> | undefined;
    messages.forEach((msg, index) => {
      if (msg.role !== "assistant" || msg.isThinking) return;
      const done = progressRef.current.get(msg.id) ?? 0;
      if (!Number.isFinite(done)) return;
      const final = index < messages.length - 1 || !isThinking;
      const { ready, consumed } = takeSentences(msg.content.slice(done), final);
      const spokenUpTo = done + consumed;
      if (consumed > 0) progressRef.current.set(msg.id, spokenUpTo);
      for (const sentence of ready) enqueue(sentence);

      // Son cümle noktayla bitti ama akış sürüyor (model öneri düğmelerini
      // üretiyor olabilir): kısa bir duraklamadan sonra beklemeden oku.
      const rest = msg.content.slice(spokenUpTo);
      if (!final && SENTENCE_END.test(rest) && !NUMBER_END.test(rest)) {
        const length = msg.content.length;
        earlyTimer = setTimeout(() => {
          const latest = messagesRef.current.find((m) => m.id === msg.id);
          if (!latest || latest.content.length !== length) return;
          if (progressRef.current.get(msg.id) !== spokenUpTo) return;
          progressRef.current.set(msg.id, length);
          for (const sentence of takeSentences(rest, true).ready) enqueue(sentence);
        }, EARLY_SENTENCE_MS);
      }
    });
    return () => clearTimeout(earlyTimer);
  }, [messages, isThinking, enabled, enqueue]);

  useEffect(() => stop, [stop]);

  return { isSupported, enabled, isSpeaking, drainCount, isBusy, enable, toggle, stop, say };
}

export type SpeechOutput = ReturnType<typeof useSpeechOutput>;
