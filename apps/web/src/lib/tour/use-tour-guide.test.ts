import { describe, expect, it } from "vitest";
import { resolveAutoTourTargetStepId } from "@/lib/tour/use-tour-guide";

describe("resolveAutoTourTargetStepId", () => {
  it("sunucu nextStepId varsa onu kullanır", () => {
    expect(resolveAutoTourTargetStepId("s9", "s2")).toBe("s2");
  });

  it("sunucu nextStepId yoksa model adımını kullanır", () => {
    expect(resolveAutoTourTargetStepId("s3", null)).toBe("s3");
  });
});
