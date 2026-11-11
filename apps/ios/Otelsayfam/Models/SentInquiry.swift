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

    private static func find(_ id: String, in context: ModelContext) -> SentInquiry? {
        try? context.fetch(FetchDescriptor<SentInquiry>(predicate: #Predicate { $0.id == id })).first
    }
}
