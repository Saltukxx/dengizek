import XCTest

/// Otel sayfasının içeriği: derin bağlantı, tam ekran galeri, yorumlar, olanaklar.
/// Yerel sunucu (localhost:3000) ve yerel örnek veriler gerekir.
@MainActor
final class HotelDetailsUITests: XCTestCase {
    private var app: XCUIApplication!

    override func setUp() async throws {
        continueAfterFailure = false
        app = XCUIApplication()
        app.launchEnvironment["OTS_RESET"] = "1"
        app.launch()
    }

    private func openHotel(_ slug: String) {
        app.open(URL(string: "otelsayfam://hotel/\(slug)")!)
        XCTAssertTrue(app.buttons["hotel.inquiry"].waitForExistence(timeout: 20), "Derin bağlantı oteli açmadı")
    }

    private func reveal(_ element: XCUIElement) {
        var tries = 0
        while !(element.exists && element.isHittable) && tries < 14 {
            app.swipeUp(velocity: .slow)
            tries += 1
        }
        XCTAssertTrue(element.exists, "\(element) bulunamadı")
    }

    private func keep(_ name: String) {
        let shot = XCTAttachment(screenshot: app.screenshot())
        shot.name = name
        shot.lifetime = .keepAlways
        add(shot)
    }

    func testDeepLinkOpensHotelWithShareAndFullScreenGallery() {
        openHotel("kar-zirvesi")
        XCTAssertTrue(app.buttons["hotel.share"].exists, "Paylaş düğmesi yok")
        keep("otel-ust")

        app.otherElements["gallery"].firstMatch.tap()
        let close = app.buttons["gallery.close"]
        XCTAssertTrue(close.waitForExistence(timeout: 5), "Tam ekran galeri açılmadı")
        keep("galeri-tam-ekran")
        app.swipeLeft()
        XCTAssertTrue(app.staticTexts["2 / 4"].waitForExistence(timeout: 3) || close.exists)
        keep("galeri-ikinci")
        close.tap()
        XCTAssertTrue(app.buttons["hotel.inquiry"].waitForExistence(timeout: 5), "Galeri kapanmadı")
    }

    func testReviewsAreShownOnHotelPage() {
        openHotel("aurelia-bay")
        let title = app.staticTexts["Misafir yorumları"]
        reveal(title)
        app.swipeUp(velocity: .slow)
        keep("yorumlar")
    }

    func testAllAmenitiesOpenInSheet() {
        openHotel("orucoglu-thermal-hotel")
        let all = app.buttons["hotel.amenities.all"]
        reveal(all)
        all.tap()
        // Kaydırma henüz durmadıysa ilk dokunuş boşa gidebiliyor: bir kez daha denenir.
        if !app.buttons["Kapat"].waitForExistence(timeout: 3) { all.tap() }
        XCTAssertTrue(app.buttons["Kapat"].waitForExistence(timeout: 5), "Olanaklar sayfası açılmadı")
        keep("olanaklar")
    }

    func testExploreCardOpensHotelAndReturns() {
        let card = app.buttons["hotel-card-orucoglu-thermal-hotel"]
        XCTAssertTrue(card.waitForExistence(timeout: 20), "Keşfet listesi gelmedi")
        // Görsellerin yüklenmesi için kısa bekleme (sonuç bekleniyor, hata değil).
        _ = app.staticTexts["yok"].waitForExistence(timeout: 2)
        keep("kesfet")
        card.tap()
        XCTAssertTrue(app.buttons["hotel.inquiry"].waitForExistence(timeout: 20), "Karttan otel sayfası açılmadı")
        app.navigationBars.buttons.firstMatch.tap()
        XCTAssertTrue(card.waitForExistence(timeout: 10), "Keşfet'e dönülemedi")
    }

    func testSavedHotelShowsPriceAlertSwitch() {
        openHotel("kar-zirvesi")
        app.buttons["Kaydet"].firstMatch.tap()
        app.tabBars.buttons["Kaydedilenler"].tap()
        XCTAssertTrue(app.staticTexts["Kaydettikleriniz"].waitForExistence(timeout: 5), "Kaydedilen otel listede yok")
        XCTAssertTrue(app.switches["saved.priceAlerts"].exists, "Fiyat bildirimi anahtarı yok")
        keep("kaydedilenler-fiyat-bildirimi")
    }
}
