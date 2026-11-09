import AVFoundation
import Observation

/// AVPlayer'ı tur makinesine bağlar: adım değişince doğru videoyu/aralığı
/// yükler, bitişi ve süreyi makineye bildirir.
@MainActor
@Observable
final class TourPlayerModel {
    private(set) var machine: TourMachine
    private(set) var currentTime: Double = 0
    let player = AVPlayer()
    let title: String?
    let hotelSlug: String
    let tourId: String
    /// Rehbere "nereleri gördü" bilgisi için.
    private(set) var seenStepIds: [String] = []

    private let resolve: (String?) -> URL?
    @ObservationIgnored private var timeObserver: Any?
    @ObservationIgnored private var boundaryObserver: Any?
    @ObservationIgnored private var statusTask: Task<Void, Never>?
    @ObservationIgnored private var endTask: Task<Void, Never>?

    init(tour: Tour, resolve: @escaping (String?) -> URL?) {
        machine = TourMachine(steps: tour.steps)
        title = tour.title
        hotelSlug = tour.hotelSlug
        tourId = tour.tourId
        self.resolve = resolve
        player.preventsDisplaySleepDuringVideoPlayback = true
        timeObserver = player.addPeriodicTimeObserver(forInterval: CMTime(seconds: 0.25, preferredTimescale: 600), queue: .main) { [weak self] time in
            MainActor.assumeIsolated { self?.tick(time.seconds) }
        }
    }

    func start() {
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .moviePlayback)
        loadCurrentStep()
    }

    func stop() {
        player.pause()
        statusTask?.cancel()
        endTask?.cancel()
        if let timeObserver { player.removeTimeObserver(timeObserver) }
        if let boundaryObserver { player.removeTimeObserver(boundaryObserver) }
        timeObserver = nil
        boundaryObserver = nil
    }

    var callout: Tour.Callout? { machine.callout(at: currentTime) }

    func continueTour() { apply { $0.continueTour() } }
    func choose(_ branch: Tour.Branch) { apply { $0.choose(branch) } }
    func go(to index: Int) { apply { $0.go(to: index) } }
    func restart() { apply { $0.restart() } }

    /// Rehberin istediği durağa geç (bilinmeyen durak sessizce yok sayılır).
    func go(toStepId stepId: String) {
        guard let index = machine.steps.firstIndex(where: { $0.stepId == stepId }) else { return }
        go(to: index)
    }

    func togglePlayback() {
        player.timeControlStatus == .playing ? player.pause() : player.play()
    }

    private func apply(_ change: (inout TourMachine) -> Void) {
        let before = machine.index
        let beforePhase = machine.phase
        change(&machine)
        if machine.phase == .loading, machine.index != before || beforePhase != .loading {
            loadCurrentStep()
        }
    }

    private func loadCurrentStep() {
        guard let step = machine.current, let url = resolve(step.media.src) else {
            machine.fail("Bu adımın videosu bulunamadı.")
            return
        }
        statusTask?.cancel()
        endTask?.cancel()
        if let boundaryObserver { player.removeTimeObserver(boundaryObserver) }
        boundaryObserver = nil

        // Aynı ortak videonun başka aralığına geçerken videoyu yeniden yükleme.
        let currentURL = (player.currentItem?.asset as? AVURLAsset)?.url
        if currentURL != url {
            player.replaceCurrentItem(with: AVPlayerItem(url: url))
        }
        if !seenStepIds.contains(step.stepId) { seenStepIds.append(step.stepId) }
        let start = step.media.startSec ?? 0
        currentTime = start
        player.seek(to: CMTime(seconds: start, preferredTimescale: 600), toleranceBefore: .zero, toleranceAfter: .zero)

        if let end = step.media.endSec, end > start {
            boundaryObserver = player.addBoundaryTimeObserver(forTimes: [NSValue(time: CMTime(seconds: end, preferredTimescale: 600))], queue: .main) { [weak self] in
                MainActor.assumeIsolated { self?.stepFinished() }
            }
        }
        observe(player.currentItem)
        player.play()
    }

    private func observe(_ item: AVPlayerItem?) {
        guard let item else { return }
        statusTask = Task { [weak self] in
            for await status in item.publisher(for: \.status).values {
                guard let self else { return }
                switch status {
                case .failed: self.machine.fail("Video oynatılamadı. Bağlantınızı kontrol edip tekrar deneyin.")
                default: break
                }
            }
        }
        endTask = Task { [weak self] in
            for await _ in NotificationCenter.default.notifications(named: AVPlayerItem.didPlayToEndTimeNotification, object: item) {
                self?.stepFinished()
            }
        }
    }

    /// Video gerçekten ilerlemeye başlayınca adım "oynuyor" sayılır.
    private func tick(_ seconds: Double) {
        currentTime = seconds
        if machine.phase == .loading, player.timeControlStatus == .playing {
            machine.videoReady()
        }
    }

    private func stepFinished() {
        guard machine.phase == .playing || machine.phase == .loading else { return }
        player.pause()
        apply { $0.videoEnded() }
    }
}
