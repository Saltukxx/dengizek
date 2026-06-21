import { describe, expect, it } from "vitest";
import {
  canOpenInquiry,
  computeCompletionState,
  getStepEndTriggerReason,
  hasInquiryIntent,
  shouldAllowOpenInquiry,
} from "@/lib/ai/completion-engine";

const steps = [
  { stepId: "s1", title: "Lobi" },
  { stepId: "s2", title: "Havuz" },
  { stepId: "s3", title: "Oda" },
  { stepId: "s4", title: "Spa" },
  { stepId: "s5", title: "Restoran" },
];

describe("computeCompletionState", () => {
  it("sıradaki görülmemiş adımı döner", () => {
    const state = computeCompletionState(steps, ["s1"], "s1");
    expect(state.nextStepId).toBe("s2");
    expect(state.seenCount).toBe(1);
    expect(state.totalCount).toBe(5);
    expect(state.progressRatio).toBe(0.2);
    expect(state.isComplete).toBe(false);
  });

  it("tüm adımlar görüldüğünde isComplete true", () => {
    const state = computeCompletionState(steps, ["s1", "s2", "s3", "s4", "s5"]);
    expect(state.isComplete).toBe(true);
    expect(state.nextStepId).toBeNull();
    expect(state.progressRatio).toBe(1);
  });

  it("remainingStepIds doğru listelenir", () => {
    const state = computeCompletionState(steps, ["s1", "s3"]);
    expect(state.remainingStepIds).toEqual(["s2", "s4", "s5"]);
  });
});

describe("openInquiry gate", () => {
  it("%80 eşiğinde izin verir", () => {
    expect(canOpenInquiry(0.79)).toBe(false);
    expect(canOpenInquiry(0.8)).toBe(true);
  });

  it("rezervasyon niyeti ile erken izin verir", () => {
    expect(hasInquiryIntent("Rezervasyon yapmak istiyorum")).toBe(true);
    expect(shouldAllowOpenInquiry(0.1, "fiyat teklifi alabilir miyim")).toBe(true);
    expect(shouldAllowOpenInquiry(0.1, "havuz nerede")).toBe(false);
  });
});

describe("getStepEndTriggerReason", () => {
  it("otomatik turda autoTourNext döner", () => {
    expect(getStepEndTriggerReason(true)).toBe("autoTourNext");
    expect(getStepEndTriggerReason(false)).toBe("stepEnd");
  });
});
