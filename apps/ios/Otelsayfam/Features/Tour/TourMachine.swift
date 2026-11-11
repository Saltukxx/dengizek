import Foundation

/// Turun akışı — web oynatıcısıyla (use-tour-player-machine) aynı kurallar.
/// Videodan bağımsızdır; oynatıcı yalnız olayları bildirir.
struct TourMachine: Equatable, Sendable {
    enum Phase: Equatable, Sendable {
        case loading
        case playing
        /// Adım bitti; misafir "Devam" demeli ya da bir dal seçmeli.
        case waitingForContinue
        case ended
        case failed(String)
    }

    let steps: [Tour.Step]
    private(set) var index = 0
    private(set) var phase: Phase = .loading

    init(steps: [Tour.Step]) {
        self.steps = steps
    }

    var current: Tour.Step? { steps.indices.contains(index) ? steps[index] : nil }
    var isLastStep: Bool { index >= steps.count - 1 }

    mutating func videoReady() {
        if case .failed = phase { return }
        phase = .playing
    }

    mutating func videoEnded() {
        guard let step = current else { return }
        if step.requiresUserContinue || !step.branches.isEmpty {
            phase = .waitingForContinue
        } else if isLastStep {
            phase = .ended
        } else {
            go(to: index + 1)
        }
    }

    mutating func continueTour() {
        guard phase == .waitingForContinue else { return }
        if isLastStep { phase = .ended } else { go(to: index + 1) }
    }

    mutating func choose(_ branch: Tour.Branch) {
        guard let target = steps.firstIndex(where: { $0.stepId == branch.nextStepId }) else { return }
        go(to: target)
    }

    mutating func go(to newIndex: Int) {
        guard steps.indices.contains(newIndex) else { return }
        index = newIndex
        phase = .loading
    }

    mutating func restart() { go(to: 0) }

    mutating func fail(_ message: String) { phase = .failed(message) }

    /// Videonun o anki saniyesinde gösterilecek açıklama (en son geçilen).
    func callout(at seconds: Double) -> Tour.Callout? {
        current?.callouts.filter { $0.tSec <= seconds }.max(by: { $0.tSec < $1.tSec })
    }
}
