import Testing
@testable import Otelsayfam

struct TourMachineTests {
    private func step(_ id: String, continue needsContinue: Bool = false, branches: [Tour.Branch] = [], callouts: [Tour.Callout] = []) -> Tour.Step {
        Tour.Step(stepId: id, kind: "room", title: id, body: nil, requiresUserContinue: needsContinue,
                  media: .init(mode: "clip", src: "/v/\(id).mp4", startSec: nil, endSec: nil),
                  captionsVttUrl: nil, callouts: callouts, branches: branches)
    }

    @Test func autoAdvancesThenEnds() {
        var machine = TourMachine(steps: [step("a"), step("b")])
        machine.videoReady()
        machine.videoEnded()
        #expect(machine.index == 1)
        #expect(machine.phase == .loading)
        machine.videoReady()
        machine.videoEnded()
        #expect(machine.phase == .ended)
    }

    @Test func waitsForContinueWhenRequired() {
        var machine = TourMachine(steps: [step("a", continue: true), step("b")])
        machine.videoEnded()
        #expect(machine.phase == .waitingForContinue)
        machine.continueTour()
        #expect(machine.index == 1)
    }

    @Test func branchJumpsToTargetStep() {
        let branch = Tour.Branch(id: "x", label: "Son adım", nextStepId: "c")
        var machine = TourMachine(steps: [step("a", branches: [branch]), step("b"), step("c")])
        machine.videoEnded()
        #expect(machine.phase == .waitingForContinue)
        machine.choose(branch)
        #expect(machine.current?.stepId == "c")
    }

    @Test func continueIgnoredUnlessWaiting() {
        var machine = TourMachine(steps: [step("a"), step("b")])
        machine.videoReady()
        machine.continueTour()
        #expect(machine.index == 0)
        #expect(machine.phase == .playing)
    }

    @Test func failureSticksUntilRetry() {
        var machine = TourMachine(steps: [step("a")])
        machine.fail("x")
        machine.videoReady()
        #expect(machine.phase == .failed("x"))
        machine.go(to: 0)
        #expect(machine.phase == .loading)
    }

    @Test func showsLatestPassedCallout() {
        let callouts = [Tour.Callout(id: "1", tSec: 0.2, title: "Lobi", body: nil), Tour.Callout(id: "2", tSec: 2, title: "Resepsiyon", body: nil)]
        let machine = TourMachine(steps: [step("a", callouts: callouts)])
        #expect(machine.callout(at: 0.1) == nil)
        #expect(machine.callout(at: 1)?.title == "Lobi")
        #expect(machine.callout(at: 3)?.title == "Resepsiyon")
    }
}
