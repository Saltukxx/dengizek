"use client";

// ---------------------------------------------------------------------------
// Sesli sohbet — telefon görüşmesi gibi, elle yazmadan.
//
//   dinliyor ──(misafir sustu)──▶ düşünüyor ──(cevap bitti)──▶ konuşuyor
//      ▲                                                          │
//      └──────────────────(okuma bitti)───────────────────────────┘
//
// Dinleme tarayıcının konuşma tanımasıyla (use-speech-input), konuşma sesli
// yanıtla (use-speech-output) yapılır; bu hook yalnız sırayı yönetir.
// Rehber konuşurken mikrofon kapalıdır (kendi sesini duymasın); misafir
// "Sözünü kes" ile araya girebilir. Üst üste sessizlikte görüşme "beklemede"
// durumuna geçer, dokununca yeniden dinler — mikrofon boşuna açık kalmaz.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useRef, useState } from "react";
import type { SpeechOutput } from "./use-speech-output";
import { useSpeechInput } from "./use-speech-input";

export type VoiceCallState = "off" | "listening" | "thinking" | "speaking" | "paused";
export type VoiceCallError = "mic-denied" | null;

/** Hiç ses duyulmazsa kaç kez yeniden dinlensin (sonra beklemeye geçer). */
const SILENT_RETRIES = 1;
/** Gönderilen soruya bu sürede cevap üretimi başlamazsa beklemeye geçilir. */
export const NO_REPLY_TIMEOUT_MS = 4000;
/** Cevabın ilk kelimesi bu sürede gelmezse kısa bir bekleme sözü söylenir. */
export const FILLER_AFTER_MS = 2500;

interface UseVoiceCallOptions {
  output: SpeechOutput;
  /** Rehber cevabı üretiyor mu (istek gönderildi ya da akıyor). */
  isThinking: boolean;
  /** Konuşma tanıma dili (BCP-47); yoksa tarayıcı dili. */
  lang?: string;
  /** Misafirin söylediğini sohbete gönderir. */
  onSend: (text: string) => void | Promise<void>;
  /** Son mesaj rehberin cevabıysa metni, değilse "" — cevap başladı mı anlamak için. */
  replyText?: string;
  /** Cevap gecikince söylenecek söz ("Bir saniye, bakıyorum."). */
  fillerText?: string;
}

export function useVoiceCall({ output, isThinking, lang, onSend, replyText = "", fillerText }: UseVoiceCallOptions) {
  const [state, setState] = useState<VoiceCallState>("off");
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState<VoiceCallError>(null);

  // Tarayıcı olayları render dışında gelir; güncel durum ref'ten okunur.
  const stateRef = useRef<VoiceCallState>("off");
  const silentCountRef = useRef(0);
  /** Gönderilen soru için cevap üretimi başladı mı. */
  const sawThinkingRef = useRef(false);
  const outputRef = useRef(output);
  outputRef.current = output;
  const replyTextRef = useRef(replyText);
  replyTextRef.current = replyText;
  const fillerTextRef = useRef(fillerText);
  fillerTextRef.current = fillerText;

  const go = useCallback((next: VoiceCallState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  const input = useSpeechInput({
    lang,
    onResult: (text) => setTranscript(text),
    onEnd: (text) => handleHeard(text),
    onError: (code) => {
      if (code === "not-allowed" || code === "service-not-allowed") {
        setError("mic-denied");
        end();
      }
    },
  });
  const inputRef = useRef(input);
  inputRef.current = input;

  function listen() {
    setTranscript("");
    go("listening");
    inputRef.current.start();
  }

  function end() {
    go("off");
    inputRef.current.cancel();
    outputRef.current.stop();
    setTranscript("");
  }

  function handleHeard(text: string) {
    if (stateRef.current !== "listening") return;
    const said = text.trim();
    if (!said) {
      if (silentCountRef.current < SILENT_RETRIES) {
        silentCountRef.current += 1;
        listen();
      } else {
        go("paused");
      }
      return;
    }
    silentCountRef.current = 0;
    sawThinkingRef.current = false;
    go("thinking");
    void onSend(said);
    // Telesekreter gibi: cevap gecikirse sessiz kalma. Gönderimden sonra son
    // mesaj misafirinkidir; rehberin metni gelmediyse replyText boştur.
    setTimeout(() => {
      const filler = fillerTextRef.current;
      if (!filler || stateRef.current !== "thinking") return;
      if (replyTextRef.current.trim() || outputRef.current.isBusy()) return;
      outputRef.current.say(filler);
    }, FILLER_AFTER_MS);
    // Soru hiç gönderilmediyse (ör. deneme hakkı doldu) görüşme takılı kalmasın.
    // Gönderme sözü beklenmez: paneller onu "void" ile çağırıyor.
    setTimeout(() => {
      if (stateRef.current === "thinking" && !sawThinkingRef.current) go("paused");
    }, NO_REPLY_TIMEOUT_MS);
  }

  const start = useCallback(() => {
    if (!inputRef.current.isSupported) return;
    setError(null);
    silentCountRef.current = 0;
    // Başlat düğmesi kullanıcı etkileşimi — ses kilidi burada açılır.
    outputRef.current.enable();
    listen();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- listen ref'lerle çalışır
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps -- end ref'lerle çalışır
  const stopCall = useCallback(() => end(), []);

  /** Duruma göre ana eylem: dinlerken "bitirdim", konuşurken "sözünü kes", beklemede "tekrar dinle". */
  const tap = useCallback(() => {
    const current = stateRef.current;
    if (current === "listening") {
      inputRef.current.stop(); // onEnd duyulanı gönderir
    } else if (current === "speaking") {
      outputRef.current.stop();
      listen();
    } else if (current === "paused") {
      silentCountRef.current = 0;
      listen();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- listen ref'lerle çalışır
  }, []);

  // Cevap üretimi başladı / bitti.
  useEffect(() => {
    if (stateRef.current !== "thinking") return;
    if (isThinking) {
      sawThinkingRef.current = true;
    } else if (sawThinkingRef.current) {
      go("speaking");
    }
  }, [isThinking, go]);

  // Okuma bitti → yeniden dinle. Son cümle sesli yanıt hook'unda aynı
  // render'da sıraya girdiği için isBusy() burada güncel.
  useEffect(() => {
    if (state === "speaking" && !output.isBusy()) listen();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- drainCount tetikler
  }, [state, output.drainCount]);

  // Panel kapanırsa görüşme de biter.
  useEffect(
    () => () => {
      stateRef.current = "off";
      outputRef.current.stop();
    },
    [],
  );

  return {
    state,
    transcript,
    error,
    isActive: state !== "off",
    isSupported: input.isSupported && output.isSupported,
    start,
    end: stopCall,
    tap,
  };
}
