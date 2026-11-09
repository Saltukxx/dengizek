import SwiftData
import SwiftUI

@main
struct OtelsayfamApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    var body: some Scene {
        WindowGroup {
            RootView()
        }
        .modelContainer(for: [SavedHotel.self, RecentHotel.self])
    }
}
