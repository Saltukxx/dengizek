import Foundation
import Observation

struct GuideMessage: Identifiable, Equatable, Sendable {
    enum Role: String, Sendable { case user, assistant }

    let id = UUID()
    let role: Role
    var text: String
    var facts: [FactCard] = []
    var prices: [PriceCard] = []
    var suggestsInquiry = false
    var failed = false
}

/// Bir otel (ve varsa tur) için rehber sohbeti.
@MainActor
@Observable
final class GuideModel: Identifiable {
    static let starterQuestions = ["Giriş-çıkış saatleri?", "Havuz var mı?", "Evcil hayvan kabul ediliyor mu?"]

    let hotelSlug: String
    let hotelName: String
    let tourId: String?
    private(set) var messages: [GuideMessage] = []
    private(set) var chips: [String] = GuideModel.starterQuestions
    private(set) var isAnswering = false
    /// Cevaplar sesli okunsun mu (sesle sorulunca kendiliğinden açılır).
    var speaksAnswers = false {
        didSet { if !speaksAnswers { speech.stop() } }
    }
    let speech: SpeechOutput

    /// Rehber "hamamı göster" gibi bir istekle tur durağına geçmek istediğinde.
    @ObservationIgnored var onNavigate: ((String) -> Void)?
    /// Tur içindeyken o anki durak ve görülen duraklar.
    @ObservationIgnored var tourPosition: (() -> (current: String, seen: [String]))?

    @ObservationIgnored private let api: APIClient
    @ObservationIgnored private var answerTask: Task<Void, Never>?
    /// Henüz seslendirilmemiş cevap metni (cümle tamamlanınca okunur).
    @ObservationIgnored private var speechBuffer = ""
    /// Sunucuya gönderilen geçmiş sınırı (sunucu 40 mesaj kabul eder).
    private let historyLimit = 20

    init(hotelSlug: String, hotelName: String, tourId: String? = nil, api: APIClient) {
        self.hotelSlug = hotelSlug
        self.hotelName = hotelName
        self.tourId = tourId
        self.api = api
        speech = SpeechOutput(api: api)
    }

    func send(_ raw: String) {
        let text = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, !isAnswering else { return }
        messages.append(GuideMessage(role: .user, text: text))
        messages.append(GuideMessage(role: .assistant, text: ""))
        chips = []
        isAnswering = true
        speech.stop()
        speechBuffer = ""

        let request = makeRequest()
        answerTask = Task { [weak self] in
            await self?.stream(request)
        }
    }

    func cancel() {
        answerTask?.cancel()
        answerTask = nil
        isAnswering = false
        speech.stop()
    }

    private func makeRequest() -> GuideRequest {
        let history = messages
            .filter { !$0.text.isEmpty && !$0.failed }
            .suffix(historyLimit)
            .map { GuideRequest.Message(role: $0.role.rawValue, text: $0.text) }
        let position = tourPosition?()
        return GuideRequest(
            hotelSlug: hotelSlug,
            tourId: tourId,
            currentStepId: position?.current,
            stepsSeen: position?.seen,
            messages: Array(history),
            deviceId: DeviceID.current
        )
    }

    private func stream(_ request: GuideRequest) async {
        defer { isAnswering = false }
        do {
            for try await event in api.guide(request) {
                apply(event)
            }
        } catch is CancellationError {
        } catch {
            updateLast { $0.failed = true; $0.text = error.localizedDescription }
        }
        speakPending(final: true)
        updateLast { message in
            if message.text.isEmpty && message.facts.isEmpty && message.prices.isEmpty && !message.failed {
                message.text = "Bu soruya şu an cevap veremedim. Dilerseniz sorunuzu ekibimize iletebilirsiniz."
                message.suggestsInquiry = true
            }
        }
    }

    private func apply(_ event: GuideEvent) {
        switch event {
        case .text(let delta):
            updateLast { $0.text += delta }
            speechBuffer += delta
            speakPending(final: false)
        case .fact(let card): updateLast { $0.facts.append(card) }
        case .price(let cards): updateLast { $0.prices.append(contentsOf: cards) }
        case .inquiry: updateLast { $0.suggestsInquiry = true }
        case .chips(let suggestions): chips = suggestions
        case .navigate(let stepId): onNavigate?(stepId)
        case .error(let message): updateLast { $0.failed = true; $0.text = message }
        case .done, .unknown: break
        }
    }

    /// Tamamlanan cümleleri seslendirme kuyruğuna verir.
    private func speakPending(final: Bool) {
        guard speaksAnswers, !speechBuffer.isEmpty else { return }
        let (ready, consumed) = SpeechText.takeSentences(speechBuffer, final: final)
        speech.enqueue(ready)
        speechBuffer = (speechBuffer as NSString).substring(from: consumed)
    }

    private func updateLast(_ change: (inout GuideMessage) -> Void) {
        guard let index = messages.indices.last, messages[index].role == .assistant else { return }
        change(&messages[index])
    }
}
