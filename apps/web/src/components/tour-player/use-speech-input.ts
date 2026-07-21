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
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
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
}

export function useSpeechInput({ lang, onResult }: UseSpeechInputOptions = {}) {
  const [isListening, setIsListening] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const [transcript, setTranscript] = useState("");
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  useEffect(() => {
    setIsSupported(getSpeechRecognitionCtor() !== null);
  }, []);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
    setIsListening(false);
  }, []);

  const start = useCallback(() => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) return;

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
      setTranscript(text);
      onResultRef.current?.(text, isFinal);
    };
    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => setIsListening(false);

    recognitionRef.current = recognition;
    setTranscript("");
    setIsListening(true);
    recognition.start();
  }, [lang]);

  useEffect(
    () => () => {
      recognitionRef.current?.stop();
    },
    [],
  );

  return { isListening, isSupported, transcript, start, stop };
}
