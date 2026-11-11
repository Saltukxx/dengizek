import Foundation
import Testing
@testable import Otelsayfam

struct StaySearchTests {
    private func date(_ iso: String) -> Date {
        try! Date(iso, strategy: Date.ISO8601FormatStyle(timeZone: .current).year().month().day())
    }

    private func value(_ items: [URLQueryItem], _ name: String) -> String? {
        items.first { $0.name == name }?.value
    }

    @Test func emptySearchSendsNothing() {
        let stay = StaySearch()
        #expect(stay.isEmpty)
        #expect(stay.queryItems.isEmpty)
        #expect(stay.datesSummary == nil)
    }

    @Test func datesAndPartyUseWebParameterNames() {
        var stay = StaySearch()
        stay.checkIn = date("2027-01-24")
        stay.checkOut = date("2027-01-27")
        stay.adults = 3
        stay.childAges = [4, 9]
        let items = stay.queryItems
        #expect(value(items, "giris") == "2027-01-24")
        #expect(value(items, "cikis") == "2027-01-27")
        #expect(value(items, "yetiskin") == "3")
        #expect(value(items, "cocuk") == "4,9")
        #expect(stay.nights == 3)
        #expect(stay.partySummary == "3 yetişkin, 2 çocuk")
        #expect(stay.datesSummary?.hasSuffix("· 3 gece") == true)
    }

    @Test func reversedDatesAreIgnored() {
        var stay = StaySearch()
        stay.checkIn = date("2027-01-27")
        stay.checkOut = date("2027-01-24")
        #expect(!stay.hasDates)
        #expect(value(stay.queryItems, "giris") == nil)
    }

    @Test func filtersCountAndQuery() {
        var filters = BrowseFilters()
        #expect(filters.activeCount == 0)
        filters.tourOnly = true
        filters.priceBand = .mid
        filters.sort = .priceAsc
        #expect(filters.activeCount == 2)
        let items = filters.queryItems
        #expect(value(items, "tur") == "1")
        #expect(value(items, "price") == "mid")
        #expect(value(items, "sort") == "price-asc")
        #expect(value(items, "kampanya") == nil)
    }

    @Test func cheapestSkipsUnavailableAndUnfitRooms() throws {
        let json = """
        {"checkIn":"2027-01-24","checkOut":"2027-01-27","nights":3,"adults":2,"childAges":[],"rooms":[
          {"slug":"a","name":"A","boardLabel":null,"fit":"no","totalMinor":100,"originalTotalMinor":null,"currency":"TRY","discountLabel":null,"freeNights":0,"unavailable":null,"minStayNights":null},
          {"slug":"b","name":"B","boardLabel":null,"fit":"fits","totalMinor":200,"originalTotalMinor":null,"currency":"TRY","discountLabel":null,"freeNights":0,"unavailable":"Bu tarihlerde müsait oda yok","minStayNights":null},
          {"slug":"c","name":"C","boardLabel":"Her şey dahil","fit":"fits","totalMinor":500,"originalTotalMinor":null,"currency":"TRY","discountLabel":null,"freeNights":0,"unavailable":null,"minStayNights":null},
          {"slug":"d","name":"D","boardLabel":null,"fit":"confirm","totalMinor":null,"originalTotalMinor":null,"currency":"TRY","discountLabel":null,"freeNights":0,"unavailable":null,"minStayNights":null}
        ]}
        """
        let quote = try JSONDecoder().decode(StayQuote.self, from: Data(json.utf8))
        #expect(quote.visibleRooms.map(\.slug) == ["b", "c", "d"])
        #expect(quote.cheapest?.slug == "c")
    }

    // MARK: Kalıcılık

    private func scratchDefaults(_ name: String) throws -> UserDefaults {
        let defaults = try #require(UserDefaults(suiteName: name))
        defaults.removePersistentDomain(forName: name)
        return defaults
    }

    @Test func savedStayIsRestored() throws {
        let defaults = try scratchDefaults("ots.tests.stay.restore")
        var stay = StaySearch()
        stay.checkIn = date("2027-01-24")
        stay.checkOut = date("2027-01-27")
        stay.childAges = [5]
        stay.save(to: defaults)
        #expect(StaySearch.restored(from: defaults, now: date("2027-01-10")) == stay)
    }

    @Test func pastCheckInDropsDatesButKeepsParty() throws {
        let defaults = try scratchDefaults("ots.tests.stay.past")
        var stay = StaySearch()
        stay.checkIn = date("2027-01-24")
        stay.checkOut = date("2027-01-27")
        stay.adults = 4
        stay.save(to: defaults)
        let restored = StaySearch.restored(from: defaults, now: date("2027-01-25"))
        #expect(!restored.hasDates)
        #expect(restored.adults == 4)
    }

    @Test func clearingStayRemovesSavedValue() throws {
        let defaults = try scratchDefaults("ots.tests.stay.clear")
        var stay = StaySearch()
        stay.adults = 3
        stay.save(to: defaults)
        StaySearch().save(to: defaults)
        #expect(StaySearch.restored(from: defaults) == StaySearch())
    }

    @MainActor @Test func storeWritesChangesAndReloadsThem() throws {
        let defaults = try scratchDefaults("ots.tests.stay.store")
        let store = StayStore(defaults: defaults)
        store.stay.adults = 5
        #expect(StayStore(defaults: defaults).stay.adults == 5)
        #expect(StayStore().stay == StaySearch())
    }
}

struct RollingAmountTests {
    @Test func keepsCurrencySignOutOfDigits() {
        let parts = RollingAmount.split(Formatting.amount(5_250_000, currency: "TRY"))
        #expect(parts.number == "52.500")
        #expect((parts.prefix + parts.suffix).contains("₺"))
    }

    @Test func keepsTextWithoutDigitsWhole() {
        let parts = RollingAmount.split("Ücretsiz")
        #expect(parts.number == "Ücretsiz")
        #expect(parts.prefix.isEmpty && parts.suffix.isEmpty)
    }
}
