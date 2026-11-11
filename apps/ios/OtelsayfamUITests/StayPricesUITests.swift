import XCTest

/// Keşfet'te seçilen tarih otel sayfasına taşınıyor, oda fiyatları geliyor,
/// odaya dokununca oda sayfası açılıyor mu? Yerel sunucu (localhost:3000)
/// çalışıyor olmalı; Oruçoğlu'nun Ocak 2027 fiyatları girili.
final class StayPricesUITests: XCTestCase {
    private var app: XCUIApplication!

    override func setUp() {
        continueAfterFailure = false
        app = XCUIApplication()
        app.launchEnvironment["OTS_STAY"] = "2027-01-24,2027-01-27,2"
        app.launch()
    }

    private func snapshot(_ name: String) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    func testDatesCarryToHotelAndRoomPages() {
        let summary = app.buttons["stay.summary"]
        XCTAssertTrue(summary.waitForExistence(timeout: 20), "Arama kartı yok")
        XCTAssertTrue(summary.label.contains("3 gece"), "Seçili tarih kartta görünmüyor: \(summary.label)")
        XCTAssertTrue(app.staticTexts.containing(NSPredicate(format: "label ENDSWITH 'otel uygun'")).firstMatch.waitForExistence(timeout: 20))
        snapshot("1-kesfet")

        summary.tap()
        XCTAssertTrue(app.navigationBars["Tarih, kişi ve filtre"].waitForExistence(timeout: 5), "Tarih ve filtre penceresi açılmadı")
        XCTAssertTrue(app.switches["Video turu olanlar"].exists)
        snapshot("2-filtreler")
        app.buttons["Vazgeç"].tap()

        // Otel sayfası: Ara sekmesinden Oruçoğlu (aynı seçim taşınır).
        app.tabBars.buttons["Ara"].tap()
        let field = app.searchFields.firstMatch
        XCTAssertTrue(field.waitForExistence(timeout: 10))
        field.tap()
        field.typeText("Oruçoğlu")
        let result = app.buttons["search-result-orucoglu-thermal-hotel"]
        XCTAssertTrue(result.waitForExistence(timeout: 20), "Arama sonucu gelmedi")
        result.tap()

        let row = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'quote-room-'")).firstMatch
        XCTAssertTrue(row.waitForExistence(timeout: 30), "Oda fiyatları gelmedi")
        var tries = 0
        while !row.isHittable && tries < 4 { app.swipeUp(velocity: .slow); tries += 1 }
        XCTAssertTrue(row.label.contains("gece toplam"), "Toplam fiyat yok: \(row.label)")
        snapshot("3-otel-fiyatlar")

        row.tap()
        XCTAssertTrue(app.buttons["room.inquiry"].waitForExistence(timeout: 10), "Oda sayfası açılmadı")
        XCTAssertTrue(app.staticTexts.containing(NSPredicate(format: "label CONTAINS 'gece toplam'")).firstMatch.waitForExistence(timeout: 20), "Oda fiyatı yok")
        snapshot("4-oda")
        app.swipeUp()
        snapshot("5-oda-alt")

        app.buttons["room.inquiry"].tap()
        XCTAssertTrue(app.navigationBars["Talep gönder"].waitForExistence(timeout: 5))
        snapshot("6-talep")
    }
}
