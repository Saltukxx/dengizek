import AVFoundation
import Observation
import Speech

/// Mikrofondan Türkçe konuşmayı yazıya çevirir. Cihaz destekliyorsa tanıma
/// cihazda yapılır; ses dışarı gönderilmez.
@MainActor
@Observable
final class SpeechInput {
    enum Status: Equatable {
        case idle
        case listening
        case denied(String)
        case unavailable
    }

    private(set) var status: Status = .idle
    private(set) var transcript = ""

    @ObservationIgnored private let recognizer = SFSpeechRecognizer(locale: Locale(identifier: "tr-TR"))
    @ObservationIgnored private let engine = AVAudioEngine()
    @ObservationIgnored private var request: SFSpeechAudioBufferRecognitionRequest?
    @ObservationIgnored private var task: SFSpeechRecognitionTask?

    var isListening: Bool { status == .listening }

    func start() async {
        guard status != .listening else { return }
        transcript = ""
        guard let recognizer, recognizer.isAvailable else {
            status = .unavailable
            return
        }
        guard await Self.requestPermissions() else {
            status = .denied("Sesli soru için Ayarlar'dan mikrofon ve konuşma tanıma iznini açın.")
            return
        }

        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playAndRecord, mode: .measurement, options: [.duckOthers, .defaultToSpeaker])
            try session.setActive(true, options: .notifyOthersOnDeactivation)

            let request = SFSpeechAudioBufferRecognitionRequest()
            request.shouldReportPartialResults = true
            request.taskHint = .search
            if recognizer.supportsOnDeviceRecognition { request.requiresOnDeviceRecognition = true }
            self.request = request

            let input = engine.inputNode
            input.removeTap(onBus: 0)
            input.installTap(onBus: 0, bufferSize: 1024, format: input.outputFormat(forBus: 0)) { buffer, _ in
                request.append(buffer)
            }
            engine.prepare()
            try engine.start()
            status = .listening

            task = recognizer.recognitionTask(with: request) { [weak self] result, error in
                let text = result?.bestTranscription.formattedString
                let isFinal = result?.isFinal ?? false
                Task { @MainActor in
                    guard let self else { return }
                    if let text { self.transcript = text }
                    if error != nil || isFinal { self.finish() }
                }
            }
        } catch {
            finish()
            status = .unavailable
        }
    }

    /// Dinlemeyi bitirir ve o ana kadarki yazıyı döner.
    @discardableResult
    func stop() -> String {
        request?.endAudio()
        finish()
        return transcript.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private func finish() {
        if engine.isRunning {
            engine.stop()
            engine.inputNode.removeTap(onBus: 0)
        }
        task?.finish()
        task = nil
        request = nil
        if status == .listening { status = .idle }
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }

    private static func requestPermissions() async -> Bool {
        let speech = await withCheckedContinuation { continuation in
            SFSpeechRecognizer.requestAuthorization { continuation.resume(returning: $0 == .authorized) }
        }
        guard speech else { return false }
        return await AVAudioApplication.requestRecordPermission()
    }
}
