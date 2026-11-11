import XCTest

/// Geniş ekran (iPad) düzeni ve video turda yatay kullanım.
/// Yerel sunucu (localhost:3000) çalışıyor olmalı.
@MainActor
final class LayoutUITests: XCTestCase {
    private var app: XCUIApplication!

    override func setUp() async throws {
        continueAfterFailure = false
        XCUIDevice.shared.orientation = .portrait
        app = XCUIApplication()
        app.launchEnvironment["OTS_RESET"] = "1"
        // `TEST_RUNNER_OTS_UI_LANG=de xcodebuild test …` ile uygulama o dilde açılır.
        if let language = ProcessInfo.processInfo.environment["OTS_UI_LANG"] {
            app.launchArguments += ["-AppleLanguages", "(\(language))", "-AppleLocale", language]
        }
        app.launch()
    }

    override func tearDown() async throws {
        XCUIDevice.shared.orientation = .portrait
    }

    private func keep(_ name: String) {
        // Ekranın tamamı: yatayda pencere görüntüsü yanlış kırpılıyor.
        let shot = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        shot.name = name
        shot.lifetime = .keepAlways
        add(shot)
    }

    private func openHotel(_ slug: String) {
        app.open(URL(string: "otelsayfam://hotel/\(slug)")!)
        XCTAssertTrue(app.buttons["hotel.inquiry"].waitForExistence(timeout: 20), "Otel sayfası açılmadı")
    }

    func testExploreAndHotelPageLayout() {
        XCTAssertTrue(app.buttons["hotel-card-orucoglu-thermal-hotel"].waitForExistence(timeout: 20), "Keşfet listesi gelmedi")
        _ = app.staticTexts["yok"].waitForExistence(timeout: 2)
        keep("duzen-kesfet")
        openHotel("kar-zirvesi")
        _ = app.staticTexts["yok"].waitForExistence(timeout: 2)
        keep("duzen-otel")
    }

    func testTourTurnsLandscapeAndAppReturnsToPortrait() throws {
        try XCTSkipIf(UIDevice.current.userInterfaceIdiom == .pad, "iPad her yönde çalışır; kilit iPhone içindir.")
        openHotel("orucoglu-thermal-hotel")
        XCUIDevice.shared.orientation = .landscapeLeft
        let window = app.windows.firstMatch
        XCTAssertLessThan(window.frame.width, window.frame.height, "Otel sayfası yataya dönmemeli")

        app.buttons["hotel.tour"].tap()
        let close = app.buttons["Turu kapat"]
        XCTAssertTrue(close.waitForExistence(timeout: 15), "Tur açılmadı")
        XCUIDevice.shared.orientation = .landscapeLeft
        let turned = NSPredicate { _, _ in window.frame.width > window.frame.height }
        wait(for: [expectation(for: turned, evaluatedWith: nil)], timeout: 5)
        // Dönüş animasyonu bitsin (görüntü yarı dönmüş çıkmasın).
        _ = app.staticTexts["yok"].waitForExistence(timeout: 2)
        keep("tur-yatay")

        close.tap()
        let upright = NSPredicate { _, _ in window.frame.width < window.frame.height }
        wait(for: [expectation(for: upright, evaluatedWith: nil)], timeout: 5)
        XCTAssertTrue(app.buttons["hotel.inquiry"].waitForExistence(timeout: 5))
    }

    /// Çeviri denetimi: ana ekranların görüntüsü (uzun metin taşması var mı?).
    func testLocalizedScreens() throws {
        try XCTSkipIf(ProcessInfo.processInfo.environment["OTS_UI_LANG"] == nil, "Yalnız dil verilince koşar.")
        XCTAssertTrue(app.buttons["hotel-card-orucoglu-thermal-hotel"].waitForExistence(timeout: 20), "Keşfet listesi gelmedi")
        _ = app.staticTexts["yok"].waitForExistence(timeout: 2)
        keep("dil-kesfet")
        openHotel("kar-zirvesi")
        keep("dil-otel")
        app.swipeUp()
        keep("dil-otel-fiyat")
        app.swipeUp()
        app.swipeUp()
        keep("dil-otel-alt")
        app.buttons["hotel.inquiry"].tap()
        XCTAssertTrue(app.textFields["inquiry.name"].waitForExistence(timeout: 5))
        keep("dil-talep")
        app.navigationBars.buttons.firstMatch.tap()
        app.tabBars.buttons.element(boundBy: 2).tap()
        _ = app.staticTexts["yok"].waitForExistence(timeout: 1)
        keep("dil-kaydedilenler")
    }
}
