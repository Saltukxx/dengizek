import XCTest

/// Otel sayfasındaki eylemler gerçekten açılıyor mu? Yerel sunucu
/// (localhost:3000) çalışıyor olmalı; rehber sorusu sunucu planlayıcısından
/// (model çağrısı olmadan) kartla cevaplanır.
final class HotelPageUITests: XCTestCase {
    private var app: XCUIApplication!

    override func setUp() {
        continueAfterFailure = false
        app = XCUIApplication()
        app.launch()
    }

    private func openOrucoglu() {
        app.tabBars.buttons["Ara"].tap()
        let field = app.searchFields.firstMatch
        XCTAssertTrue(field.waitForExistence(timeout: 10))
        field.tap()
        field.typeText("Oruçoğlu")
        let result = app.buttons["search-result-orucoglu-thermal-hotel"]
        XCTAssertTrue(result.waitForExistence(timeout: 20), "Arama sonucu gelmedi")
        result.tap()
    }

    private func reveal(_ element: XCUIElement) {
        XCTAssertTrue(element.waitForExistence(timeout: 20), "\(element) bulunamadı")
        var tries = 0
        while !element.isHittable && tries < 6 {
            app.swipeUp()
            tries += 1
        }
    }

    func testGuideOpensAndAnswersWithVerifiedCard() {
        openOrucoglu()
        let guide = app.buttons["hotel.guide"]
        reveal(guide)
        guide.tap()

        XCTAssertTrue(app.staticTexts["Merak ettiğinizi sorun."].waitForExistence(timeout: 5), "Rehber penceresi açılmadı")
        let input = app.textFields["guide.input"].exists ? app.textFields["guide.input"] : app.textViews["guide.input"]
        input.tap()
        input.typeText("Giriş saati kaçta?")
        app.buttons["guide.send"].tap()

        let card = app.staticTexts.containing(NSPredicate(format: "label CONTAINS 'Check-in'")).firstMatch
        XCTAssertTrue(card.waitForExistence(timeout: 45), "Rehber cevabı gelmedi")
    }

    func testInquiryFormOpens() {
        openOrucoglu()
        let inquiry = app.buttons["hotel.inquiry"]
        reveal(inquiry)
        inquiry.tap()
        XCTAssertTrue(app.navigationBars["Talep gönder"].waitForExistence(timeout: 5), "Talep formu açılmadı")
        XCTAssertTrue(app.textFields["Ad Soyad"].waitForExistence(timeout: 5), "Form alanları görünmüyor")
    }

    func testTourOpens() {
        openOrucoglu()
        let tour = app.buttons["hotel.tour"]
        reveal(tour)
        tour.tap()
        XCTAssertTrue(app.buttons["Turu kapat"].waitForExistence(timeout: 15), "Tur açılmadı")
        app.buttons["Turu kapat"].tap()
    }
}
