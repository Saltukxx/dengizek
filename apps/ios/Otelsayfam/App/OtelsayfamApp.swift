import SwiftData
import SwiftUI

@main
struct OtelsayfamApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    init() {
        DebugLaunch.resetIfRequested()
    }

    /// Veriler uygulamanın kendi klasöründe durur. App Group yetkisi gelince
    /// SwiftData depoyu kendiliğinden ortak klasöre taşımasın diye yer açıkça
    /// sabitlenir (taşınırsa misafirin kaydettikleri kaybolurdu). Widget depoyu
    /// okumaz; ona ayrı bir özet yazılır (WidgetSync).
    private static let container: ModelContainer = {
        let configuration = ModelConfiguration(isStoredInMemoryOnly: DebugLaunch.resetsState, groupContainer: .none)
        do {
            return try ModelContainer(for: SavedHotel.self, RecentHotel.self, SentInquiry.self, configurations: configuration)
        } catch {
            fatalError("Veri deposu açılamadı: \(error)")
        }
    }()

    var body: some Scene {
        WindowGroup {
            RootView()
        }
        .modelContainer(Self.container)
    }
}
