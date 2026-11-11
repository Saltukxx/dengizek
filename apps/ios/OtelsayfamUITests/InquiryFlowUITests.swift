import XCTest

/// Talep gönderilince izi uygulamada kalıyor mu, sonraki form dolu açılıyor mu?
/// Yerel sunucu (localhost:3000) çalışıyor olmalı; her koşu yerel veritabanına
/// bir talep yazar. Uygulama `OTS_RESET=1` ile temiz açılır.
@MainActor
final class InquiryFlowUITests: XCTestCase {
    private var app: XCUIApplication!

    override func setUp() async throws {
        continueAfterFailure = false
        app = XCUIApplication()
        app.launchEnvironment["OTS_RESET"] = "1"
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

    private func openInquiryForm() {
        let inquiry = app.buttons["hotel.inquiry"]
        XCTAssertTrue(inquiry.waitForExistence(timeout: 20), "Talep düğmesi yok")
        inquiry.tap()
        XCTAssertTrue(app.textFields["inquiry.name"].waitForExistence(timeout: 5), "Talep formu açılmadı")
    }

    func testSentInquiryIsKeptAndNextFormIsPrefilled() {
        openOrucoglu()
        openInquiryForm()

        let name = app.textFields["inquiry.name"]
        name.tap()
        name.typeText("Deneme Misafir")
        let email = app.textFields["inquiry.email"]
        email.tap()
        email.typeText("deneme@example.com")
        let message = app.descendants(matching: .any)["inquiry.message"]
        message.tap()
        message.typeText("Arayuz testi: musaitlik var mi?")

        let send = app.buttons["inquiry.send"]
        var tries = 0
        while !send.isHittable && tries < 6 {
            app.swipeUp()
            tries += 1
        }
        send.tap()
        XCTAssertTrue(app.staticTexts["Talebiniz alındı"].waitForExistence(timeout: 20), "Talep gönderilemedi")
        app.buttons["Tamam"].tap()

        // İkinci form: ad ve e-posta hatırlanır.
        openInquiryForm()
        XCTAssertEqual(app.textFields["inquiry.name"].value as? String, "Deneme Misafir")
        XCTAssertEqual(app.textFields["inquiry.email"].value as? String, "deneme@example.com")
        app.buttons["Vazgeç"].tap()

        // Talep Kaydedilenler'de durur ve yazışma bağlantısı açılabilir.
        app.tabBars.buttons["Kaydedilenler"].tap()
        XCTAssertTrue(app.staticTexts["Talepleriniz"].waitForExistence(timeout: 5), "Talepler bölümü yok")
        let row = app.buttons["inquiry-orucoglu-thermal-hotel"]
        XCTAssertTrue(row.waitForExistence(timeout: 5), "Gönderilen talep listede yok")
        XCTAssertTrue(row.isEnabled, "Yazışma bağlantısı gelmedi")
        let shot = XCTAttachment(screenshot: app.screenshot())
        shot.lifetime = .keepAlways
        add(shot)
    }
}
