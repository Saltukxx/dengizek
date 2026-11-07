"use client";

// ---------------------------------------------------------------------------
// Ses girişi — tarayıcının Web Speech API'sini (SpeechRecognition /
// webkitSpeechRecognition) sarmalar. Backend değişikliği gerektirmez;
// transkript metne çevrilip normal metin akışına eklenir. Safari/Firefox
// kısmi/hiç desteklemediğinden isSupported=false iken çağıran taraf mikrofon
// butonunu tamamen gizlemeli — bu bir "nice-to-have", asla zorunlu bağımlılık
// değil.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useRef, useState } from "react";

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: { transcript: string };
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
}

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort?(): void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event?: { error?: string }) => void) | null;
  onend: (() => void) | null;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

interface UseSpeechInputOptions {
  /** BCP-47 dil kodu, örn. "tr-TR". Varsayılan: tarayıcı dili. */
  lang?: string;
  onResult?: (transcript: string, isFinal: boolean) => void;
  /**
   * Dinleme kendiliğinden bitti (misafir sustu) ya da stop() çağrıldı —
   * duyulan son metinle. cancel() ile bitince çağrılmaz. Hiçbir şey
   * duyulmadıysa boş metinle çağrılır.
   */
  onEnd?: (transcript: string) => void;
  /** Tarayıcının hata kodu: "no-speech", "not-allowed", "network"… */
  onError?: (error: string) => void;
}

export function useSpeechInput({ lang, onResult, onEnd, onError }: UseSpeechInputOptions = {}) {
  const [isListening, setIsListening] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const [transcript, setTranscript] = useState("");
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;
  const onEndRef = useRef(onEnd);
  onEndRef.current = onEnd;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  useEffect(() => {
    setIsSupported(getSpeechRecognitionCtor() !== null);
  }, []);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
    setIsListening(false);
  }, []);

  /** Dinlemeyi keser, duyulanı göndermez (onEnd çağrılmaz). */
  const cancel = useCallback(() => {
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    if (recognition) {
      recognition.onend = null;
      if (recognition.abort) recognition.abort();
      else recognition.stop();
    }
    setIsListening(false);
  }, []);

  const start = useCallback(() => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) return;

    // Önceki oturum açık kaldıysa onun sonucu yenisine karışmasın.
    const previous = recognitionRef.current;
    if (previous) {
      previous.onend = null;
      previous.onresult = null;
      previous.onerror = null;
      if (previous.abort) previous.abort();
      else previous.stop();
    }

    let heard = "";
    const recognition = new Ctor();
    recognition.lang = lang ?? (typeof navigator !== "undefined" ? navigator.language : "tr-TR");
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.onresult = (event) => {
      let text = "";
      let isFinal = false;
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        if (!result) continue;
        text += result[0].transcript;
        if (result.isFinal) isFinal = true;
      }
      heard = text;
      setTranscript(text);
      onResultRef.current?.(text, isFinal);
    };
    recognition.onerror = (event) => {
      setIsListening(false);
      onErrorRef.current?.(event?.error ?? "unknown");
    };
    recognition.onend = () => {
      if (recognitionRef.current === recognition) recognitionRef.current = null;
      setIsListening(false);
      onEndRef.current?.(heard);
    };

    recognitionRef.current = recognition;
    setTranscript("");
    setIsListening(true);
    recognition.start();
  }, [lang]);

  // Panel kapanınca dinleme kesilir; yarım kalan söz gönderilmez.
  useEffect(() => cancel, [cancel]);

  return { isListening, isSupported, transcript, start, stop, cancel };
}
