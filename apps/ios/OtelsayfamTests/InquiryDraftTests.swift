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
        #expect(body.checkIn == nil)
        #expect(body.source == "hotel_chat")
    }

    @Test func savedProfileFillsOnlyEmptyFields() {
        var draft = InquiryDraft()
        draft.email = "yeni@example.com"
        draft.apply(GuestProfile(name: "Ayşe Yılmaz", email: "ayse@example.com"))
        #expect(draft.name == "Ayşe Yılmaz")
        #expect(draft.email == "yeni@example.com")
        #expect(filled().profile == GuestProfile(name: "Ayşe Yılmaz", email: "ayse@example.com"))
    }

    @Test func profileSurvivesRoundTrip() throws {
        let defaults = try #require(UserDefaults(suiteName: "ots.tests.guest"))
        defaults.removePersistentDomain(forName: "ots.tests.guest")
        #expect(GuestProfile.load(from: defaults) == GuestProfile())
        GuestProfile(name: "Ayşe", email: "ayse@example.com").save(to: defaults)
        #expect(GuestProfile.load(from: defaults).email == "ayse@example.com")
        defaults.removePersistentDomain(forName: "ots.tests.guest")
    }

    @Test func datesUseServerDayFormat() {
        var draft = filled()
        draft.hasDates = true
        let body = draft.body(hotelSlug: "oruc", source: .hotelPage, tourId: nil)
        #expect(body.checkIn?.count == 10)
        #expect(body.checkIn?.contains("-") == true)
    }
}
