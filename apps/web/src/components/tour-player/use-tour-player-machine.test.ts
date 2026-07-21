// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { TourManifest } from "@/lib/schemas/tour-manifest";
import { useTourPlayerMachine } from "./use-tour-player-machine";

function makeManifest(overrides?: Partial<TourManifest>): TourManifest {
  return {
    tourId: "demo",
    hotelSlug: "aurelia-bay",
    version: 1,
    steps: [
      {
        stepId: "s1",
        order: 0,
        kind: "lobby",
        title: "Lobi",
        requiresUserContinue: false,
        media: { mode: "clip", src: "/demo/1.mp4" },
        aiVisible: true,
      },
      {
        stepId: "s2",
        order: 1,
        kind: "room",
        title: "Oda",
        requiresUserContinue: true,
        media: { mode: "clip", src: "/demo/2.mp4" },
        aiVisible: true,
      },
      {
        stepId: "s3",
        order: 2,
        kind: "amenity_spot",
        title: "Sahil",
        requiresUserContinue: false,
        media: { mode: "clip", src: "/demo/3.mp4" },
        aiVisible: true,
      },
    ],
    ...overrides,
  } as TourManifest;
}

function setup(manifest = makeManifest()) {
  const onStepChange = vi.fn();
  const onComplete = vi.fn();
  const view = renderHook(() => useTourPlayerMachine(manifest, { onStepChange, onComplete }));
  return { view, onStepChange, onComplete };
}

describe("useTourPlayerMachine", () => {
  it("loading fazında başlar ve adımları order'a göre sıralar", () => {
    const shuffled = makeManifest();
    shuffled.steps = [shuffled.steps[2]!, shuffled.steps[0]!, shuffled.steps[1]!];
    const { view } = setup(shuffled);

    expect(view.result.current.machine.phase).toBe("loading");
    expect(view.result.current.machine.stepIndex).toBe(0);
    expect(view.result.current.sortedSteps.map((s) => s.stepId)).toEqual(["s1", "s2", "s3"]);
    expect(view.result.current.currentStep?.stepId).toBe("s1");
  });

  it("canplay ile playing fazına geçer", () => {
    const { view } = setup();
    act(() => view.result.current.handleCanPlay());
    expect(view.result.current.machine.phase).toBe("playing");
  });

  it("requiresUserContinue=false adım bitince sonraki adıma geçer", () => {
    const { view, onComplete } = setup();
    act(() => view.result.current.handleCanPlay());
    act(() => view.result.current.handleVideoEnded());

    expect(view.result.current.machine).toMatchObject({ phase: "loading", stepIndex: 1 });
    expect(view.result.current.currentStep?.stepId).toBe("s2");
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("requiresUserContinue=true adım bitince pausedForInteraction'a geçer", () => {
    const { view } = setup();
    act(() => view.result.current.handleVideoEnded()); // s1 → s2
    act(() => view.result.current.handleCanPlay());
    act(() => view.result.current.handleVideoEnded()); // s2 requiresUserContinue

    expect(view.result.current.machine).toMatchObject({
      phase: "pausedForInteraction",
      stepIndex: 1,
    });
  });

  it("continueFromPause duraklamadan sonraki adıma ilerletir", () => {
    const { view } = setup();
    act(() => view.result.current.handleVideoEnded()); // → s2
    act(() => view.result.current.handleVideoEnded()); // → pausedForInteraction
    act(() => view.result.current.continueFromPause());

    expect(view.result.current.machine).toMatchObject({ phase: "loading", stepIndex: 2 });
  });

  it("continueFromPause yalnızca pausedForInteraction fazında çalışır", () => {
    const { view } = setup();
    act(() => view.result.current.handleCanPlay());
    act(() => view.result.current.continueFromPause());

    expect(view.result.current.machine).toMatchObject({ phase: "playing", stepIndex: 0 });
  });

  it("son adım bitince ended fazına geçer ve onComplete çağrılır", () => {
    const { view, onComplete } = setup();
    act(() => view.result.current.handleVideoEnded()); // → s2
    act(() => view.result.current.handleVideoEnded()); // → paused
    act(() => view.result.current.continueFromPause()); // → s3
    act(() => view.result.current.handleVideoEnded()); // s3 son adım

    expect(view.result.current.machine.phase).toBe("ended");
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("son adım requiresUserContinue ise önce duraklar, continue ile biter", () => {
    const manifest = makeManifest();
    manifest.steps[2]!.requiresUserContinue = true;
    const { view, onComplete } = setup(manifest);
    act(() => view.result.current.goToIndex(2));
    act(() => view.result.current.handleVideoEnded());

    expect(view.result.current.machine.phase).toBe("pausedForInteraction");
    expect(onComplete).not.toHaveBeenCalled();

    act(() => view.result.current.continueFromPause());
    expect(view.result.current.machine.phase).toBe("ended");
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("goToIndex adım değiştirir ve onStepChange bildirir", () => {
    const { view, onStepChange } = setup();
    act(() => view.result.current.goToIndex(2));

    expect(view.result.current.machine).toMatchObject({ phase: "loading", stepIndex: 2 });
    expect(onStepChange).toHaveBeenCalledWith(2, expect.objectContaining({ stepId: "s3" }));
  });

  it("goToIndex sınır dışı indexte ended'a geçer", () => {
    const { view, onComplete } = setup();
    act(() => view.result.current.goToIndex(99));

    expect(view.result.current.machine.phase).toBe("ended");
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("goToStepId bilinen id'ye gider, bilinmeyeni yok sayar", () => {
    const { view } = setup();
    act(() => view.result.current.goToStepId("s2"));
    expect(view.result.current.machine.stepIndex).toBe(1);

    act(() => view.result.current.goToStepId("yok-boyle-adim"));
    expect(view.result.current.machine).toMatchObject({ phase: "loading", stepIndex: 1 });
  });

  it("setError error fazına geçirir ve canplay hatayı ezmez", () => {
    const { view } = setup();
    act(() => view.result.current.setError("Video yüklenemedi."));

    expect(view.result.current.machine.phase).toBe("error");
    expect(view.result.current.machine.errorMessage).toBe("Video yüklenemedi.");

    act(() => view.result.current.handleCanPlay());
    expect(view.result.current.machine.phase).toBe("error");
  });
});
