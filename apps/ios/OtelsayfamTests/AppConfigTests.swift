import Testing
@testable import Otelsayfam

struct AppConfigTests {
    @Test func apiBaseURLHasScheme() {
        #expect(AppConfig.apiBaseURL.scheme != nil)
    }
}
