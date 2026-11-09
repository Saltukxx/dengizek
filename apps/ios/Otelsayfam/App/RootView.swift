import SwiftUI

/// Uygulamanın ana sekmeleri. Seçili sezon (termal / yaz / kış) web'deki
/// gibi tüm uygulamanın temasını belirler.
struct RootView: View {
    @AppStorage("ots.season") private var season: Season = .termal
    @State private var debugTour = DebugLaunch.tour
    @State private var push = PushCenter.shared

    private var theme: Theme { .forSeason(season) }

    var body: some View {
        TabView {
            Tab("Keşfet", systemImage: "sparkles") {
                NavigationStack {
                    ExploreView(season: $season)
                }
            }
            Tab("Ara", systemImage: "magnifyingglass") {
                NavigationStack {
                    SearchView()
                }
            }
            Tab("Kaydedilenler", systemImage: "heart") {
                NavigationStack {
                    SavedView()
                }
            }
        }
        .environment(\.theme, theme)
        .tint(theme.isDark ? theme.primary : theme.primary)
        .preferredColorScheme(theme.isDark ? .dark : .light)
        .animation(.easeInOut(duration: 0.3), value: season)
        .sheet(item: $push.pendingPage) { page in
            SafariView(url: page.url).ignoresSafeArea()
        }
        .fullScreenCover(item: $debugTour) { target in
            TourScreen(hotelSlug: target.hotelSlug, tourId: target.tourId)
                .environment(\.theme, theme)
        }
    }
}

/// Yalnız geliştirmede: `OTS_OPEN_TOUR=otel-slug/tur-id` ile açılınca doğrudan o tura gider
/// (simülatörde elle gezinmeden oynatıcıyı denemek için).
enum DebugLaunch {
    struct TourTarget: Identifiable {
        let hotelSlug: String
        let tourId: String
        var id: String { "\(hotelSlug)/\(tourId)" }
    }

    static var tour: TourTarget? {
        #if DEBUG
        let parts = ProcessInfo.processInfo.environment["OTS_OPEN_TOUR"]?.split(separator: "/") ?? []
        guard parts.count == 2 else { return nil }
        return TourTarget(hotelSlug: String(parts[0]), tourId: String(parts[1]))
        #else
        return nil
        #endif
    }
}

#Preview {
    RootView()
        .modelContainer(for: [SavedHotel.self, RecentHotel.self], inMemory: true)
}
