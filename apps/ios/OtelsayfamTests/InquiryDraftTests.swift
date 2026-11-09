import Foundation
import Testing
@testable import Otelsayfam

struct InquiryDraftTests {
    private func filled() -> InquiryDraft {
        var draft = InquiryDraft()
        draft.name = " Ayşe Yılmaz "
        draft.email = "ayse@example.com"
        draft.message = "Aralık için müsaitlik?"
        return draft
    }

    @Test func requiresNameEmailAndMessage() {
        #expect(InquiryDraft().validationError == "Adınızı yazın.")
        var draft = filled()
        draft.email = "ayse@"
        #expect(draft.validationError == "Geçerli bir e-posta adresi yazın.")
        #expect(filled().validationError == nil)
    }

    @Test func rejectsCheckoutBeforeCheckin() {
        var draft = filled()
        draft.hasDates = true
        draft.checkOut = draft.checkIn
        #expect(draft.validationError == "Çıkış tarihi girişten sonra olmalı.")
    }

    @Test func bodyTrimsAndOmitsUnusedFields() {
        let body = filled().body(hotelSlug: "oruc", source: .guide, tourId: nil)
        #expect(body.name == "Ayşe Yılmaz")
        #expect(body.phone == nil)
        #expect(body.checkIn == nil)
        #expect(body.source == "hotel_chat")
    }

    @Test func datesUseServerDayFormat() {
        var draft = filled()
        draft.hasDates = true
        let body = draft.body(hotelSlug: "oruc", source: .hotelPage, tourId: nil)
        #expect(body.checkIn?.count == 10)
        #expect(body.checkIn?.contains("-") == true)
    }
}
