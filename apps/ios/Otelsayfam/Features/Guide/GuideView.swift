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
                    Button(model.speaksAnswers ? "Sesli yanıtı kapat" : "Sesli yanıtı aç",
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
            Eyebrow(model.hotelName)
            Text("Merak ettiğinizi sorun.")
                .font(theme.display(26, style: .title2))
                .foregroundStyle(theme.isDark ? theme.text : theme.navy)
            Text("Cevaplar otelin girdiği bilgilerden gelir. Bilgi yoksa uydurmaz; sorunuzu ekibimize iletmenizi önerir.")
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
                                .overlay(Capsule().strokeBorder(theme.lineStrong))
                        }
                    }
                    .padding(.horizontal)
                }
                .scrollIndicators(.hidden)
            }
            HStack(alignment: .bottom, spacing: 8) {
                Button(voice.isListening ? "Dinlemeyi bitir ve gönder" : "Sesli sor",
                       systemImage: voice.isListening ? "waveform.circle.fill" : "mic.circle") {
                    toggleListening()
                }
                .labelStyle(.iconOnly)
                .font(.title)
                .foregroundStyle(voice.isListening ? Color.red : theme.primary)
                .symbolEffect(.variableColor.iterative, isActive: voice.isListening)
                .disabled(model.isAnswering)
                TextField(voice.isListening ? "Dinliyorum…" : "Sorunuzu yazın…", text: $draft, axis: .vertical)
                    .lineLimit(1...4)
                    .focused($inputFocused)
                    .submitLabel(.send)
                    .onSubmit(send)
                    .accessibilityIdentifier("guide.input")
                    .font(theme.body(16))
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                    .background(theme.surface2, in: .rect(cornerRadius: 20))
                    .overlay(RoundedRectangle(cornerRadius: 20).strokeBorder(theme.line))
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
                ForEach(message.prices, id: \.roomSlug) { card in
                    PriceCardView(card: card)
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

private struct FactCardView: View {
    @Environment(\.theme) private var theme
    let card: FactCard

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Label(card.label, systemImage: symbol)
                .font(.caption.weight(.semibold))
                .foregroundStyle(color)
            if let title = card.title { Text(title).font(theme.body(15, weight: 700)).foregroundStyle(theme.text) }
            Text(card.text).font(theme.body(15)).foregroundStyle(theme.text)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(theme.surface, in: .rect(cornerRadius: theme.radiusMedium))
        .overlay(alignment: .leading) { Rectangle().fill(color).frame(width: 3) }
        .clipShape(.rect(cornerRadius: theme.radiusMedium))
        .overlay(RoundedRectangle(cornerRadius: theme.radiusMedium).strokeBorder(theme.line))
        .accessibilityElement(children: .combine)
    }

    private var color: Color {
        switch card.kind {
        case "verified": Color(hex: 0x0CA678)
        case "policy": Color(hex: 0x1C7ED6)
        default: Color(hex: 0xF08C00)
        }
    }

    private var symbol: String {
        switch card.kind {
        case "verified": "checkmark.seal.fill"
        case "policy": "doc.text"
        default: "quote.bubble"
        }
    }
}

private struct PriceCardView: View {
    @Environment(\.theme) private var theme
    let card: PriceCard

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(card.roomName).font(theme.display(17, style: .headline)).foregroundStyle(theme.isDark ? theme.text : theme.navy)
            ForEach(card.lines, id: \.label) { line in
                HStack(alignment: .top) {
                    Text(line.label).foregroundStyle(theme.textDim)
                    Spacer(minLength: 12)
                    Text(line.value).foregroundStyle(theme.text).multilineTextAlignment(.trailing)
                }
                .font(theme.body(14))
            }
            if card.priceOnRequest {
                Text("Fiyat talep üzerine verilir.").font(.caption).foregroundStyle(.secondary)
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
