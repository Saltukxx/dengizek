import SwiftUI

struct GuideView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.theme) private var theme
    let model: GuideModel
    /// "Ekibimize sorun" düğmesi bu formu açar; misafirin son sorusu mesaja hazır gelir.
    var inquiryForm: ((_ lastQuestion: String) -> InquiryView)?
    @State private var draft = ""
    @State private var showsInquiry = false
    @State private var voice = SpeechInput()
    @FocusState private var inputFocused: Bool

    var body: some View {
        NavigationStack {
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 14) {
                        intro
                        ForEach(model.messages) { message in
                            GuideMessageView(message: message, isStreaming: model.isAnswering && message.id == model.messages.last?.id, onInquiry: inquiryForm == nil ? nil : { showsInquiry = true })
                                .id(message.id)
                        }
                    }
                    .padding()
                }
                .background(theme.bg)
                .scrollDismissesKeyboard(.interactively)
                .onChange(of: model.messages.last?.text) {
                    if let last = model.messages.last { proxy.scrollTo(last.id, anchor: .bottom) }
                }
                .onChange(of: model.messages.count) {
                    if let last = model.messages.last { withAnimation { proxy.scrollTo(last.id, anchor: .bottom) } }
                }
            }
            .safeAreaInset(edge: .bottom) { composer }
            .sheet(isPresented: $showsInquiry) {
                inquiryForm?(model.messages.last(where: { $0.role == .user })?.text ?? "")
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(theme.surface, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button(model.speaksAnswers ? String(localized: "Sesli yanıtı kapat") : String(localized: "Sesli yanıtı aç"),
                           systemImage: model.speaksAnswers ? "speaker.wave.2.fill" : "speaker.slash") {
                        model.speaksAnswers.toggle()
                    }
                }
                ToolbarItem(placement: .principal) {
                    HStack(spacing: 8) {
                        GuideAvatar(size: 26)
                        Text("Yapay Zekâ Rehberi")
                            .font(theme.body(16, weight: 700))
                            .foregroundStyle(theme.isDark ? theme.sand : theme.cta)
                    }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Kapat") { dismiss() }
                }
            }
            .onDisappear {
                voice.stop()
                model.speech.stop()
            }
            .onChange(of: voice.transcript) { _, text in
                if voice.isListening { draft = text }
            }
        }
    }

    private var intro: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Merak ettiğinizi sorun.")
                .font(theme.display(26, style: .title2))
                .foregroundStyle(theme.isDark ? theme.text : theme.navy)
            Text("Cevaplar \(model.hotelName) için girilen bilgilerden gelir. Bilgi yoksa uydurmaz; sorunuzu ekibimize iletmenizi önerir.")
                .font(theme.body(14))
                .foregroundStyle(theme.textDim)
        }
        .padding(.bottom, 4)
    }

    private var composer: some View {
        VStack(spacing: 8) {
            if case .denied(let message) = voice.status {
                Text(message).font(.footnote).foregroundStyle(.secondary).padding(.horizontal)
            } else if voice.status == .unavailable {
                Text("Bu cihazda Türkçe konuşma tanıma şu an kullanılamıyor.").font(.footnote).foregroundStyle(.secondary).padding(.horizontal)
            }
            if !model.chips.isEmpty && !model.isAnswering {
                ScrollView(.horizontal) {
                    HStack {
                        ForEach(model.chips, id: \.self) { chip in
                            Button(chip) { model.send(chip) }
                                .font(theme.body(14, weight: 600))
                                .foregroundStyle(theme.isDark ? theme.text : theme.primary)
                                .padding(.horizontal, 14)
                                .padding(.vertical, 8)
                                .background(theme.surface, in: .capsule)
                                .overlay { Capsule().strokeBorder(theme.lineStrong) }
                        }
                    }
                    .padding(.horizontal)
                }
                .scrollIndicators(.hidden)
            }
            HStack(alignment: .bottom, spacing: 8) {
                Button(voice.isListening ? String(localized: "Dinlemeyi bitir ve gönder") : String(localized: "Sesli sor"),
                       systemImage: voice.isListening ? "waveform.circle.fill" : "mic.circle") {
                    toggleListening()
                }
                .labelStyle(.iconOnly)
                .font(.title)
                .foregroundStyle(voice.isListening ? Color.red : theme.primary)
                .symbolEffect(.variableColor.iterative, isActive: voice.isListening)
                .disabled(model.isAnswering)
                TextField(voice.isListening ? String(localized: "Dinliyorum…") : String(localized: "Sorunuzu yazın…"), text: $draft, axis: .vertical)
                    .lineLimit(1...4)
                    .focused($inputFocused)
                    .submitLabel(.send)
                    .onSubmit(send)
                    .accessibilityIdentifier("guide.input")
                    .font(theme.body(16))
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                    .background(theme.surface2, in: .rect(cornerRadius: 20))
                    .overlay { RoundedRectangle(cornerRadius: 20).strokeBorder(theme.line) }
                if model.isAnswering {
                    Button("Durdur", systemImage: "stop.circle.fill") { model.cancel() }
                        .labelStyle(.iconOnly)
                        .font(.title)
                } else {
                    Button("Gönder", systemImage: "arrow.up.circle.fill", action: send)
                        .accessibilityIdentifier("guide.send")
                        .labelStyle(.iconOnly)
                        .font(.title)
                        .disabled(draft.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
            .padding(.horizontal)
        }
        .padding(.vertical, 8)
        .background(theme.surface)
        .overlay(alignment: .top) { Divider().overlay(theme.line) }
    }

    private func send() {
        model.send(draft)
        draft = ""
    }

    /// Sesle sorulan sorunun cevabı da sesli okunur.
    private func toggleListening() {
        if voice.isListening {
            let text = voice.stop()
            draft = ""
            guard !text.isEmpty else { return }
            model.speaksAnswers = true
            model.send(text)
        } else {
            model.speech.stop()
            inputFocused = false
            Task { await voice.start() }
        }
    }
}

private struct GuideMessageView: View {
    @Environment(\.theme) private var theme
    let message: GuideMessage
    let isStreaming: Bool
    let onInquiry: (() -> Void)?

    var body: some View {
        if message.role == .user {
            Text(message.text)
                .font(theme.body(16))
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .background(theme.primary, in: .rect(cornerRadius: 18))
                .foregroundStyle(theme.onPrimary)
                .frame(maxWidth: .infinity, alignment: .trailing)
                .padding(.leading, 48)
        } else {
            VStack(alignment: .leading, spacing: 10) {
                ForEach(Array(message.facts.enumerated()), id: \.offset) { _, card in
                    FactCardView(card: card)
                }
                if message.prices.count == 1, let card = message.prices.first {
                    PriceCardView(card: card)
                } else if message.prices.count > 1 {
                    RoomPriceList(cards: message.prices)
                }
                if message.text.isEmpty && isStreaming {
                    TypingIndicator()
                } else if !message.text.isEmpty {
                    Text(message.text)
                        .font(theme.body(16))
                        .lineSpacing(3)
                        .foregroundStyle(message.failed ? Color.red : theme.text)
                        .textSelection(.enabled)
                }
                if message.suggestsInquiry, let onInquiry {
                    Button("Ekibimize sorun", systemImage: "paperplane.fill", action: onInquiry)
                        .font(theme.body(14, weight: 600))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 8)
                        .background(theme.cta, in: .rect(cornerRadius: theme.radius))
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.trailing, 32)
        }
    }
}

/// Birden çok oda için fiyat cevabı: ortak bilgiler (tarih, gece, kişi,
/// pansiyon, müsaitlik notu) üstte bir kez; altta tek kartta oda satırları.
private struct RoomPriceList: View {
    @Environment(\.theme) private var theme
    let cards: [PriceCard]

    var body: some View {
        let shared = sharedLines
        let sharedLabels = Set(shared.map(\.label))
        let short = shared.filter { $0.value.count <= 32 }
        let notes = shared.filter { $0.value.count > 32 }.map(\.value)
            + (cards.allSatisfy(\.priceOnRequest) ? [String(localized: "Fiyat talep üzerine verilir.")] : [])
        VStack(alignment: .leading, spacing: 10) {
            VStack(alignment: .leading, spacing: 0) {
                if !short.isEmpty {
                    VStack(alignment: .leading, spacing: 4) { PriceLines(lines: short) }
                        .padding(14)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(theme.surface2)
                    Divider().overlay(theme.line)
                }
                ForEach(Array(cards.enumerated()), id: \.element.roomSlug) { index, card in
                    VStack(alignment: .leading, spacing: 4) {
                        Text(card.roomName)
                            .font(theme.display(17, style: .headline))
                            .foregroundStyle(theme.isDark ? theme.text : theme.navy)
                        PriceLines(lines: card.lines.filter { !sharedLabels.contains($0.label) })
                    }
                    .padding(.vertical, 12)
                    .padding(.horizontal, 14)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .accessibilityElement(children: .combine)
                    if index < cards.count - 1 { Divider().overlay(theme.line) }
                }
            }
            .cardSurface()
            ForEach(notes, id: \.self) { note in
                Label(note, systemImage: "info.circle")
                    .font(theme.body(13))
                    .foregroundStyle(theme.textDim)
            }
        }
    }

    private var sharedLines: [PriceCard.Line] {
        guard let first = cards.first else { return [] }
        return first.lines.filter { line in
            cards.allSatisfy { card in card.lines.contains { $0.label == line.label && $0.value == line.value } }
        }
    }
}

private struct PriceLines: View {
    @Environment(\.theme) private var theme
    let lines: [PriceCard.Line]

    var body: some View {
        ForEach(lines, id: \.label) { line in
            HStack(alignment: .top) {
                Text(line.label).foregroundStyle(theme.textDim)
                Spacer(minLength: 12)
                Text(line.value).foregroundStyle(theme.text).multilineTextAlignment(.trailing)
            }
            .font(theme.body(14))
        }
    }
}

/// Kaynak kartı: türünü renkli simge ve etiketle söyler; zemin aynı rengin
/// çok açık tonu. (Sol kenar çizgili kart kalıbı kullanılmaz.)
private struct FactCardView: View {
    @Environment(\.theme) private var theme
    let card: FactCard

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                Image(systemName: symbol)
                    .font(.caption.weight(.bold))
                Text(card.label)
                    .font(theme.body(12, weight: 700))
                    .textCase(.uppercase)
                    .tracking(0.6)
            }
            .foregroundStyle(color)
            if let title = card.title { Text(title).font(theme.body(15, weight: 700)).foregroundStyle(theme.text) }
            Text(card.text).font(theme.body(15)).foregroundStyle(theme.text).lineSpacing(2)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(color.opacity(theme.isDark ? 0.14 : 0.07), in: .rect(cornerRadius: theme.radiusMedium, style: .continuous))
        .accessibilityElement(children: .combine)
    }

    private var color: Color {
        switch card.kind {
        case "verified": Color(hex: 0x0B7A5A)
        case "policy": Color(hex: 0x1960A8)
        default: Color(hex: 0xA25E00)
        }
    }

    private var symbol: String {
        switch card.kind {
        case "verified": "checkmark.seal.fill"
        case "policy": "doc.text.fill"
        default: "quote.bubble.fill"
        }
    }
}

private struct PriceCardView: View {
    @Environment(\.theme) private var theme
    let card: PriceCard

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(card.roomName).font(theme.display(17, style: .headline)).foregroundStyle(theme.isDark ? theme.text : theme.navy)
            PriceLines(lines: card.lines)
            if card.priceOnRequest {
                Text("Fiyat talep üzerine verilir.").font(theme.body(12)).foregroundStyle(theme.textDim)
            }
        }
        .padding(14)
        .cardSurface()
        .accessibilityElement(children: .combine)
    }
}

private struct TypingIndicator: View {
    var body: some View {
        HStack(spacing: 6) {
            ProgressView().controlSize(.small)
            Text("Rehber yazıyor…").font(.footnote).foregroundStyle(.secondary)
        }
    }
}

#Preview {
    let model = GuideModel(hotelSlug: "orucoglu-thermal-hotel", hotelName: "Oruçoğlu", api: .live)
    return GuideView(model: model)
        .task { model.send("20 Aralık'ta 2 kişi 3 gece ne kadar?") }
}
