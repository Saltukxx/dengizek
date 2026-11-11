import Foundation
import SwiftData
import Testing
@testable import Otelsayfam

@MainActor
struct HotelLibraryTests {
    let context: ModelContext

    init() throws {
        let container = try ModelContainer(for: SavedHotel.self, RecentHotel.self, SentInquiry.self, configurations: ModelConfiguration(isStoredInMemoryOnly: true))
        context = ModelContext(container)
    }

    private func hotel(_ slug: String) -> HotelSummary {
        HotelSummary(slug: slug, name: slug.capitalized, city: "Afyon", imageUrl: nil)
    }

    @Test func toggleSavesThenRemoves() {
        HotelLibrary.toggleSaved(hotel("oruc"), in: context)
        #expect(HotelLibrary.isSaved("oruc", in: context))
        HotelLibrary.toggleSaved(hotel("oruc"), in: context)
        #expect(!HotelLibrary.isSaved("oruc", in: context))
    }

    @Test func recentViewsAreUniqueAndCapped() throws {
        for i in 0..<(HotelLibrary.recentLimit + 5) { HotelLibrary.recordView(hotel("otel-\(i)"), in: context) }
        HotelLibrary.recordView(hotel("otel-0"), in: context)
        let recent = try context.fetch(FetchDescriptor<RecentHotel>(sortBy: [SortDescriptor(\.viewedAt, order: .reverse)]))
        #expect(recent.count == HotelLibrary.recentLimit)
        #expect(recent.first?.slug == "otel-0")
        #expect(Set(recent.map(\.slug)).count == recent.count)
    }

    // MARK: Gönderilen talepler

    private func draft() -> InquiryDraft {
        var draft = InquiryDraft()
        draft.name = "Ayşe"
        draft.email = "ayse@example.com"
        draft.message = " Aralık için müsaitlik? "
        return draft
    }

    @Test func sentInquiryIsStoredOnceWithPortalLink() throws {
        let receipt = InquiryReceipt(id: "talep-1", portalUrl: "https://otelsayfam.com/inquiry/portal/abc")
        for _ in 0..<2 {
            InquiryLog.record(receipt, draft: draft(), hotelSlug: "oruc", hotelName: "Oruçoğlu", imageUrl: nil, in: context)
        }
        let stored = try context.fetch(FetchDescriptor<SentInquiry>())
        #expect(stored.count == 1)
        #expect(stored.first?.message == "Aralık için müsaitlik?")
        #expect(stored.first?.checkIn == nil)
        #expect(stored.first?.portalPage?.url.absoluteString == "https://otelsayfam.com/inquiry/portal/abc")
    }

    @Test func portalLinkMustBeWebAddress() throws {
        InquiryLog.record(InquiryReceipt(id: "talep-2", portalUrl: "javascript:alert(1)"), draft: draft(), hotelSlug: "oruc", hotelName: "Oruçoğlu", imageUrl: nil, in: context)
        InquiryLog.record(InquiryReceipt(id: "talep-3", portalUrl: nil), draft: draft(), hotelSlug: "oruc", hotelName: "Oruçoğlu", imageUrl: nil, in: context)
        let stored = try context.fetch(FetchDescriptor<SentInquiry>())
        #expect(stored.allSatisfy { $0.portalPage == nil })
    }

    @Test func replyMarksInquiryUnreadUntilOpened() throws {
        InquiryLog.record(InquiryReceipt(id: "talep-4", portalUrl: nil), draft: draft(), hotelSlug: "oruc", hotelName: "Oruçoğlu", imageUrl: nil, in: context)
        InquiryLog.markReply(inquiryId: "talep-4", unread: true, in: context)
        #expect(try context.fetch(FetchDescriptor<SentInquiry>()).first?.hasUnreadReply == true)
        InquiryLog.markReply(inquiryId: "talep-4", unread: false, in: context)
        InquiryLog.markReply(inquiryId: "bilinmeyen", unread: true, in: context)
        #expect(try context.fetch(FetchDescriptor<SentInquiry>()).first?.hasUnreadReply == false)
    }
}
