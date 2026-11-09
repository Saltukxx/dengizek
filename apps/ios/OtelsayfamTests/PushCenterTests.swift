import Foundation
import Testing
@testable import Otelsayfam

@MainActor
struct PushCenterTests {
    @Test func opensPortalLinkFromNotification() {
        let center = PushCenter()
        center.open(userInfo: ["portalUrl": "https://otelsayfam.com/inquiry/portal/abc"])
        #expect(center.pendingPage?.url.absoluteString == "https://otelsayfam.com/inquiry/portal/abc")
    }

    @Test func ignoresNonWebOrMissingLinks() {
        let center = PushCenter()
        center.open(userInfo: ["portalUrl": "javascript:alert(1)"])
        #expect(center.pendingPage == nil)
        center.open(userInfo: [:])
        #expect(center.pendingPage == nil)
    }

    @Test func debugBuildsUseSandbox() {
        #expect(PushCenter.environment == "sandbox")
    }
}
