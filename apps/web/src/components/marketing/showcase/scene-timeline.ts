// ---------------------------------------------------------------------------
// Vitrin banner sahnesinin zaman çizelgesi — saf fonksiyon.
//
// Sahnenin her anı yalnız geçen süreden hesaplanır: duraklatma süreyi
// dondurur, "hareketi azalt" sabit bir anı gösterir, testler zamanlayıcısız
// çalışır. Duraklar ve sorular yüzeye göre değişir (bkz. showcase-config.ts);
// ilk durak demo sorusunun, ikincisi takip sorusunun konusudur.
// ---------------------------------------------------------------------------

import type { ShowcaseScript } from "@/lib/marketing/showcase-config";

export type SceneStopIndex = 0 | 1 | 2;

export interface SceneDialog {
  question: string;
  answer: string;
  cardLabel: string;
  hotelName: string;
}

export interface SceneMessage {
  id: string;
  role: "guest" | "guide";
  text: string;
  /** Misafir mesajı harf harf yazılıyor. */
  typing?: boolean;
  /** Rehber cevabının altındaki bilgi kartı. */
  card?: { label: string; source: string; text: string };
}

export interface SceneFrame {
  stop: SceneStopIndex;
  /** Etkin durağın ilerlemesi (0–1) — durak şeridi. */
  stopProgress: number;
  messages: SceneMessage[];
  /** Rehber yazıyor (üç nokta). */
  thinking: boolean;
  /** "Oteli gezdir" düğmesi basılı görünür. */
  autoTourPressed: boolean;
  /** Döngü sonunda sahne kararır, baştan başlar. */
  fading: boolean;
}

const TYPE_MS_PER_CHAR = 45;

/** Zaman damgaları (ms). */
export const T = {
  question: 900,
  thinkingEnd: 3600,
  card: 4000,
  followUp: 7200,
  stop1: 8600,
  autoTour: 11600,
  stop2: 12100,
  fade: 15400,
  total: 16000,
} as const;

/** "Hareketi azalt": cevap ve kart görünür, ilk durakta sabit kare. */
export const STILL_TIME = T.card + 400;

type ScriptLines = Pick<ShowcaseScript, "followUp" | "followUpReply" | "autoTourReply">;

function typed(text: string, startedAt: number, t: number): { text: string; done: boolean } {
  const chars = Math.max(0, Math.floor((t - startedAt) / TYPE_MS_PER_CHAR));
  return { text: text.slice(0, chars), done: chars >= text.length };
}

function stopAt(t: number): { stop: SceneStopIndex; progress: number } {
  if (t >= T.stop2) return { stop: 2, progress: Math.min(1, (t - T.stop2) / (T.total - T.stop2)) };
  if (t >= T.stop1) return { stop: 1, progress: (t - T.stop1) / (T.stop2 - T.stop1) };
  return { stop: 0, progress: t / T.stop1 };
}

export function sceneAt(elapsed: number, dialog: SceneDialog, script: ScriptLines): SceneFrame {
  const t = ((elapsed % T.total) + T.total) % T.total;
  const { stop, progress } = stopAt(t);
  const messages: SceneMessage[] = [];

  if (t >= T.question) {
    const q = typed(dialog.question, T.question, t);
    messages.push({ id: "q1", role: "guest", text: q.text, typing: !q.done });
  }
  const thinkingStart = T.question + dialog.question.length * TYPE_MS_PER_CHAR + 300;
  if (t >= T.thinkingEnd) {
    messages.push({
      id: "a1",
      role: "guide",
      text: dialog.answer,
      card: t >= T.card ? { label: dialog.cardLabel, source: dialog.hotelName, text: dialog.answer } : undefined,
    });
  }
  // Takip sorusu, ikinci durağa geçişten önce yazılmış olmalı.
  const followUpStart = Math.min(T.followUp, T.stop1 - 600 - script.followUp.length * TYPE_MS_PER_CHAR);
  if (t >= followUpStart) {
    const q = typed(script.followUp, followUpStart, t);
    messages.push({ id: "q2", role: "guest", text: q.text, typing: !q.done });
  }
  if (t >= T.stop1) messages.push({ id: "a2", role: "guide", text: script.followUpReply });
  if (t >= T.stop2) messages.push({ id: "a3", role: "guide", text: script.autoTourReply });

  return {
    stop,
    stopProgress: progress,
    messages,
    thinking: (t >= thinkingStart && t < T.thinkingEnd) || (t >= T.stop1 - 500 && t < T.stop1),
    autoTourPressed: t >= T.autoTour && t < T.stop2 + 600,
    fading: t >= T.fade,
  };
}
