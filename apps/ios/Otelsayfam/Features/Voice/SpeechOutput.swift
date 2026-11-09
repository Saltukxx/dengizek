import AVFoundation
import Observation

/// Rehber cevabını cümle cümle seslendirir: önce sunucudaki Piper sesi
/// (`/api/voice/speak`), servis yoksa cihazın Türkçe sesi.
@MainActor
@Observable
final class SpeechOutput: NSObject {
    private(set) var isSpeaking = false

    @ObservationIgnored private let api: APIClient
    @ObservationIgnored private var queue: [String] = []
    @ObservationIgnored private var worker: Task<Void, Never>?
    @ObservationIgnored private var player: AVAudioPlayer?
    @ObservationIgnored private var playbackDone: CheckedContinuation<Void, Never>?
    @ObservationIgnored private let synthesizer = AVSpeechSynthesizer()
    /// Piper bir kez başarısız olursa bu oturumda tekrar denenmez.
    @ObservationIgnored private var serverVoiceAvailable = true

    init(api: APIClient) {
        self.api = api
        super.init()
        synthesizer.delegate = self
    }

    func enqueue(_ sentences: [String]) {
        let prepared = sentences.map(SpeechText.prepare).filter { !$0.isEmpty }
        guard !prepared.isEmpty else { return }
        queue.append(contentsOf: prepared)
        if worker == nil { startWorker() }
    }

    func stop() {
        queue.removeAll()
        worker?.cancel()
        worker = nil
        player?.stop()
        player = nil
        synthesizer.stopSpeaking(at: .immediate)
        finishPlayback()
        isSpeaking = false
    }

    private func startWorker() {
        isSpeaking = true
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .spokenAudio, options: [.duckOthers])
        try? AVAudioSession.sharedInstance().setActive(true)
        worker = Task { [weak self] in
            // Bir sonraki cümlenin sesi, öncekisi çalarken hazırlanır.
            var prefetched: (text: String, audio: Task<Data?, Never>)?
            while let self, !Task.isCancelled {
                let current = prefetched ?? self.next().map { ($0, self.fetch($0)) }
                guard let current else { break }
                prefetched = self.next().map { ($0, self.fetch($0)) }
                if let data = await current.audio.value {
                    await self.play(data)
                } else {
                    await self.speakLocally(current.text)
                }
            }
            prefetched?.audio.cancel()
            self?.worker = nil
            self?.isSpeaking = false
        }
    }

    private func next() -> String? {
        queue.isEmpty ? nil : queue.removeFirst()
    }

    private func fetch(_ text: String) -> Task<Data?, Never> {
        let api = api
        let enabled = serverVoiceAvailable
        return Task { [weak self] in
            guard enabled else { return nil }
            do {
                return try await api.speak(text)
            } catch {
                await MainActor.run { self?.serverVoiceAvailable = false }
                return nil
            }
        }
    }

    private func play(_ data: Data) async {
        guard let player = try? AVAudioPlayer(data: data) else { return }
        self.player = player
        player.delegate = self
        await withCheckedContinuation { continuation in
            playbackDone = continuation
            if !player.play() { finishPlayback() }
        }
    }

    private func speakLocally(_ text: String) async {
        let utterance = AVSpeechUtterance(string: text)
        utterance.voice = AVSpeechSynthesisVoice(language: "tr-TR")
        await withCheckedContinuation { continuation in
            playbackDone = continuation
            synthesizer.speak(utterance)
        }
    }

    private func finishPlayback() {
        playbackDone?.resume()
        playbackDone = nil
    }
}

extension SpeechOutput: AVAudioPlayerDelegate, AVSpeechSynthesizerDelegate {
    nonisolated func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
        Task { @MainActor in self.finishPlayback() }
    }

    nonisolated func audioPlayerDecodeErrorDidOccur(_ player: AVAudioPlayer, error: Error?) {
        Task { @MainActor in self.finishPlayback() }
    }

    nonisolated func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        Task { @MainActor in self.finishPlayback() }
    }

    nonisolated func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didCancel utterance: AVSpeechUtterance) {
        Task { @MainActor in self.finishPlayback() }
    }
}
