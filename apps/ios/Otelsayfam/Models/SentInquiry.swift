import Foundation
import SwiftData

/// Bu cihazdan gönderilen talep. Misafirin hesabı yok; talebin izi ve
/// yazışma (portal) bağlantısı yalnız cihazda tutulur.
@Model
final class SentInquiry {
    @Attribute(.unique) var id: String
    var hotelSlug: String
    var hotelName: String
    var imageUrl: String?
    var checkIn: Date?
    var checkOut: Date?
    var adults: Int
    var children: Int
    var message: String
    /// Yazışma sayfası. Eski sunucu göndermez; o zaman cevap yalnız e-postayla izlenir.
    var portalUrl: String?
    var sentAt: Date
    /// Cevap bildirimi geldi, misafir henüz yazışmayı açmadı.
    var hasUnreadReply: Bool
    /// Misafirin yazışmada gördüğü cevap sayısı; sunucudaki sayı bunu geçerse yeni cevap var.
    var seenReplyCount: Int = 0

    init(
        id: String,
        hotelSlug: String,
        hotelName: String,
        imageUrl: String?,
        checkIn: Date?,
        checkOut: Date?,
        adults: Int,
        children: Int,
        message: String,
        portalUrl: String?,
        sentAt: Date = .now,
        hasUnreadReply: Bool = false
    ) {
        self.id = id
        self.hotelSlug = hotelSlug
        self.hotelName = hotelName
        self.imageUrl = imageUrl
        self.checkIn = checkIn
        self.checkOut = checkOut
        self.adults = adults
        self.children = children
        self.message = message
        self.portalUrl = portalUrl
        self.sentAt = sentAt
        self.hasUnreadReply = hasUnreadReply
    }

    /// Yalnız http(s) bağlantı açılır.
    var portalPage: WebPage? {
        guard let portalUrl, let url = URL(string: portalUrl), url.scheme?.hasPrefix("http") == true else { return nil }
        return WebPage(url: url)
    }

    /// Yazışma anahtarı: portal adresinin son parçası (`…/inquiry/portal/{token}`).
    var portalToken: String? {
        guard let url = portalPage?.url else { return nil }
        let parts = url.pathComponents
        guard parts.count >= 2, parts[parts.count - 2] == "portal", let token = parts.last,
              token.wholeMatch(of: /[A-Za-z0-9_-]{16,200}/) != nil else { return nil }
        return token
    }

    /// "24 – 27 Oca · 3 gece"; tarih verilmediyse nil.
    var datesSummary: String? {
        StaySearch(checkIn: checkIn, checkOut: checkOut).datesSummary
    }
}

/// Sunucunun talep yanıtı.
struct InquiryReceipt: Decodable, Sendable, Equatable {
    let id: String
    let portalUrl: String?
}

@MainActor
enum InquiryLog {
    /// Gönderilen talebi cihaza yazar (aynı kimlik ikinci kez eklenmez).
    static func record(
        _ receipt: InquiryReceipt,
        draft: InquiryDraft,
        hotelSlug: String,
        hotelName: String,
        imageUrl: String?,
        in context: ModelContext
    ) {
        guard find(receipt.id, in: context) == nil else { return }
        context.insert(SentInquiry(
            id: receipt.id,
            hotelSlug: hotelSlug,
            hotelName: hotelName,
            imageUrl: imageUrl,
            checkIn: draft.hasDates ? draft.checkIn : nil,
            checkOut: draft.hasDates ? draft.checkOut : nil,
            adults: draft.adults,
            children: draft.children,
            message: draft.message.trimmingCharacters(in: .whitespacesAndNewlines),
            portalUrl: receipt.portalUrl
        ))
        try? context.save()
    }

    /// Cevap bildirimi: `unread` yazışma açılana kadar işaretli kalır.
    static func markReply(inquiryId: String, unread: Bool, in context: ModelContext) {
        guard let inquiry = find(inquiryId, in: context), inquiry.hasUnreadReply != unread else { return }
        inquiry.hasUnreadReply = unread
        try? context.save()
    }

    /// Yazışma açıldı: görülen cevap sayısı güncellenir, rozet kalkar.
    static func markSeen(inquiryId: String, replyCount: Int, in context: ModelContext) {
        guard let inquiry = find(inquiryId, in: context) else { return }
        guard inquiry.hasUnreadReply || inquiry.seenReplyCount != replyCount else { return }
        inquiry.seenReplyCount = replyCount
        inquiry.hasUnreadReply = false
        try? context.save()
    }

    /// Bildirim izni olmasa da cevap fark edilsin: son taleplerin yazışması
    /// sunucudan sorulur, görülenden fazla cevap varsa "yeni cevap" işaretlenir.
    /// Ulaşılamayan ya da süresi dolan yazışma sessizce atlanır.
    static func checkReplies(in context: ModelContext, api: APIClient, limit: Int = 10) async {
        var descriptor = FetchDescriptor<SentInquiry>(sortBy: [SortDescriptor(\.sentAt, order: .reverse)])
        descriptor.fetchLimit = limit
        let targets = ((try? context.fetch(descriptor)) ?? []).compactMap { inquiry in
            inquiry.portalToken.map { (id: inquiry.id, token: $0) }
        }
        for target in targets {
            guard let fetched = try? await api.inquiryThread(token: target.token), !fetched.isStale else { continue }
            guard let inquiry = find(target.id, in: context), fetched.value.replyCount > inquiry.seenReplyCount, !inquiry.hasUnreadReply else { continue }
            inquiry.hasUnreadReply = true
            try? context.save()
        }
    }

    static func find(_ id: String, in context: ModelContext) -> SentInquiry? {
        try? context.fetch(FetchDescriptor<SentInquiry>(predicate: #Predicate { $0.id == id })).first
    }
}
