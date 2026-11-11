import SwiftData
import SwiftUI

/// Talep yazışması: misafirin talebi, ekibin cevapları ve yeni mesaj.
/// Web portalındaki yazışmanın aynısı; değerlendirme ve veri silme portalda kalır.
struct InquiryThreadView: View {
    @Environment(\.api) private var api
    @Environment(\.modelContext) private var context
    @Environment(\.theme) private var theme
    @Query private var matches: [SentInquiry]
    @State private var state: Loadable<InquiryThread> = .loading
    @State private var isStale = false
    @State private var draft = ""
    @State private var isSending = false
    @State private var sendError: String?
    @State private var portal: WebPage?
    @State private var push = PushCenter.shared
    @FocusState private var inputFocused: Bool
    private let inquiryId: String

    init(inquiryId: String) {
        self.inquiryId = inquiryId
        _matches = Query(filter: #Predicate<SentInquiry> { $0.id == inquiryId })
    }

    private var inquiry: SentInquiry? { matches.first }

    var body: some View {
        Group {
            if let inquiry, let token = inquiry.portalToken {
                thread(inquiry, token: token)
            } else {
                // Talep listeden kaldırılmış ya da yazışma bağlantısı yok.
                StateMessageView(symbol: "envelope", title: String(localized: "Yazışma bulunamadı"), message: String(localized: "Bu talebin yazışması bu cihazda yok. Cevaplar e-postanıza gelir."))
            }
        }
        .background(theme.bg)
        .brandedNavigationTitle(inquiry?.hotelName ?? String(localized: "Talep"))
        .sheet(item: $portal) { page in
            SafariView(url: page.url).ignoresSafeArea()
        }
    }

    private func thread(_ inquiry: SentInquiry, token: String) -> some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 12) {
                    summary(inquiry)
                    if isStale { OfflineNotice() }
                    if !inquiry.message.isEmpty {
                        MessageBubble(text: inquiry.message, sender: nil, date: inquiry.sentAt, isOwn: true, isPending: false)
                    }
                    switch state {
                    case .loading:
                        VStack(alignment: .leading, spacing: 12) {
                            SkeletonBlock(width: 240, height: 56, radius: 18)
                            SkeletonBlock(width: 180, height: 40, radius: 18)
                        }
                        .skeleton()
                    case .failed(.notFound):
                        StateMessageView(symbol: "clock.badge.exclamationmark", title: String(localized: "Yazışma kapandı"), message: String(localized: "Bu yazışmanın bağlantısı artık geçerli değil. Yeni bir sorunuz varsa otel sayfasından talep gönderebilirsiniz."))
                    case .failed(let error):
                        ErrorStateView(error: error) { await load(token: token) }
                    case .loaded(let thread):
                        ForEach(thread.messages) { message in
                            MessageBubble(text: message.body, sender: message.isOwn ? nil : (message.senderName ?? "Otelsayfam"), date: message.createdAt, isOwn: message.isOwn, isPending: message.isPending)
                                .id(message.id)
                        }
                        if thread.replyCount == 0 {
                            Label("Ekibimiz talebinizi inceliyor. Cevap burada ve e-postanızda görünür.", systemImage: "hourglass")
                                .font(theme.body(14))
                                .foregroundStyle(theme.textDim)
                                .padding(.top, 4)
                        }
                    }
                    Color.clear.frame(height: 1).id(Self.bottomID)
                }
                .padding(16)
                .readableWidth()
            }
            .scrollDismissesKeyboard(.interactively)
            .refreshable { await load(token: token) }
            .onChange(of: state.value?.messages.count) {
                withAnimation { proxy.scrollTo(Self.bottomID, anchor: .bottom) }
            }
        }
        .safeAreaInset(edge: .bottom) {
            if let thread = state.value { composer(thread, token: token) }
        }
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                if let page = inquiry.portalPage {
                    // Değerlendirme yazma ve kişisel verileri silme web sayfasında.
                    Button("Web'de aç", systemImage: "safari") { portal = page }
                }
            }
        }
        .task { await load(token: token) }
        // Yazışma açıkken cevap bildirimi geldi: liste tazelenir.
        .onChange(of: push.replyEvent) { _, event in
            guard event?.inquiryId == inquiryId else { return }
            Task { await load(token: token) }
        }
        .sensoryFeedback(.error, trigger: sendError) { _, message in message != nil }
    }

    private static let bottomID = "thread-bottom"

    /// Talebin özeti: tarih ve kişi. Dokununca otel sayfası açılır.
    private func summary(_ inquiry: SentInquiry) -> some View {
        NavigationLink(value: HotelSummary(slug: inquiry.hotelSlug, name: inquiry.hotelName, city: nil, imageUrl: inquiry.imageUrl)) {
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(inquiry.datesSummary ?? String(localized: "Tarih belirtilmedi"))
                        .font(theme.body(15, weight: 600))
                        .foregroundStyle(theme.text)
                    Text(party(inquiry))
                        .font(theme.body(14))
                        .foregroundStyle(theme.textDim)
                }
                Spacer(minLength: 0)
                Label("Oteli gör", systemImage: "chevron.right")
                    .labelStyle(TrailingIconLabelStyle())
                    .font(theme.body(14, weight: 600))
                    .foregroundStyle(theme.isDark ? theme.text : theme.primary)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
            .frame(minHeight: 44)
            .background(theme.surface2, in: .rect(cornerRadius: theme.radius, style: .continuous))
        }
        .buttonStyle(.pressScaleRow)
        .accessibilityElement(children: .combine)
    }

    private func party(_ inquiry: SentInquiry) -> String {
        var parts = [String(localized: "\(inquiry.adults) yetişkin")]
        if inquiry.children > 0 { parts.append(String(localized: "\(inquiry.children) çocuk")) }
        return parts.joined(separator: " · ")
    }

    @ViewBuilder private func composer(_ thread: InquiryThread, token: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            if thread.inquiry.isClosed {
                Label("Bu talep kapatıldı; yeni mesaj yazılamaz.", systemImage: "lock")
                    .font(theme.body(14))
                    .foregroundStyle(theme.textDim)
                    .frame(maxWidth: .infinity, alignment: .leading)
            } else {
                if let sendError {
                    Label(sendError, systemImage: "exclamationmark.triangle.fill")
                        .font(theme.body(13))
                        .foregroundStyle(.red)
                }
                HStack(alignment: .bottom, spacing: 8) {
                    TextField("Mesajınızı yazın…", text: $draft, axis: .vertical)
                        .lineLimit(1...5)
                        .focused($inputFocused)
                        .accessibilityIdentifier("thread.input")
                        .font(theme.body(16))
                        .padding(.horizontal, 14)
                        .padding(.vertical, 10)
                        .background(theme.surface2, in: .rect(cornerRadius: 20))
                        .overlay { RoundedRectangle(cornerRadius: 20).strokeBorder(theme.line) }
                    Button("Gönder", systemImage: "arrow.up.circle.fill") { send(token: token) }
                        .labelStyle(.iconOnly)
                        .font(.title)
                        .disabled(isSending || isStale || draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                        .accessibilityIdentifier("thread.send")
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
        .readableWidth()
        .background(theme.surface)
        .overlay(alignment: .top) { Divider().overlay(theme.line) }
    }

    private func load(token: String) async {
        do {
            let fetched = try await api.inquiryThread(token: token)
            isStale = fetched.isStale
            state = .loaded(fetched.value)
            // Çevrimdışı kayıt eski olabilir; görülen sayı yalnız canlı yanıtla ilerler.
            if !fetched.isStale {
                InquiryLog.markSeen(inquiryId: inquiryId, replyCount: fetched.value.replyCount, in: context)
            }
        } catch is CancellationError {
        } catch {
            // Liste ekrandayken yenileme başarısızsa eski yazışma kalır.
            if state.value == nil { state = .failed(APIError(error)) }
        }
    }

    private func send(token: String) {
        let text = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, !isSending else { return }
        isSending = true
        sendError = nil
        Task {
            defer { isSending = false }
            do {
                let message = try await api.sendInquiryMessage(token: token, body: text)
                draft = ""
                if case .loaded(let thread) = state {
                    state = .loaded(InquiryThread(inquiry: thread.inquiry, messages: thread.messages + [message]))
                }
            } catch {
                sendError = APIError(error) == .notFound
                    ? String(localized: "Bu yazışmanın bağlantısı artık geçerli değil.")
                    : error.localizedDescription
            }
        }
    }
}

/// Yazışma balonu: misafirin mesajı sağda dolu, cevaplar solda kart.
private struct MessageBubble: View {
    @Environment(\.theme) private var theme
    let text: String
    /// Cevabı yazan (misafirin kendi mesajında nil).
    let sender: String?
    let date: Date
    let isOwn: Bool
    let isPending: Bool

    var body: some View {
        VStack(alignment: isOwn ? .trailing : .leading, spacing: 4) {
            if let sender {
                Text(sender)
                    .font(theme.body(13, weight: 700))
                    .foregroundStyle(theme.isDark ? theme.sand : theme.primary)
            }
            Text(text)
                .font(theme.body(16))
                .lineSpacing(2)
                .foregroundStyle(isOwn ? theme.onPrimary : theme.text)
                .textSelection(.enabled)
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .background(isOwn ? theme.primary : theme.surface, in: .rect(cornerRadius: 18, style: .continuous))
                .overlay {
                    if !isOwn { RoundedRectangle(cornerRadius: 18, style: .continuous).strokeBorder(theme.line) }
                }
            Text(isPending ? String(localized: "\(stamp) · Ekibimiz inceliyor") : stamp)
                .font(theme.body(12))
                .foregroundStyle(theme.textDim)
        }
        .frame(maxWidth: .infinity, alignment: isOwn ? .trailing : .leading)
        .padding(isOwn ? .leading : .trailing, 40)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(isOwn ? String(localized: "Siz: \(text), \(stamp)") : "\(sender ?? ""): \(text), \(stamp)")
    }

    private var stamp: String {
        date.formatted(.dateTime.day().month(.abbreviated).hour().minute())
    }
}
