import CoreSpotlight
import SwiftData
import SwiftUI

/// Uygulamanın ana sekmeleri. Seçili sezon (termal / yaz / kış) web'deki
/// gibi tüm uygulamanın temasını belirler.
struct RootView: View {
    @AppStorage("ots.season") private var season: Season = .termal
    @State private var debugTour = DebugLaunch.tour
    @State private var push = PushCenter.shared
    @State private var stayStore = DebugLaunch.stayStore()
    @State private var router = Router()
    @Environment(\.modelContext) private var context
    @Environment(\.api) private var api
    @Environment(\.scenePhase) private var scenePhase
    @Query(filter: #Predicate<SentInquiry> { $0.hasUnreadReply }) private var unreadInquiries: [SentInquiry]

    private var theme: Theme { .forSeason(season) }

    var body: some View {
        TabView(selection: $router.tab) {
            Tab("Keşfet", systemImage: "sparkles", value: Router.Tab.explore) {
                NavigationStack(path: $router.explorePath) {
                    ExploreView(season: $season)
                }
            }
            Tab("Ara", systemImage: "magnifyingglass", value: Router.Tab.search) {
                NavigationStack {
                    SearchView()
                }
            }
            Tab("Kaydedilenler", systemImage: "heart", value: Router.Tab.saved) {
                NavigationStack(path: $router.savedPath) {
                    SavedView()
                }
            }
            .badge(unreadInquiries.count)
        }
        .environment(\.theme, theme)
        .environment(stayStore)
        .tint(theme.primary)
        .preferredColorScheme(theme.isDark ? .dark : .light)
        .animation(.easeInOut(duration: 0.3), value: season)
        .onOpenURL { router.open($0) }
        // iPhone aramasından (Spotlight) seçilen otel.
        .onContinueUserActivity(CSSearchableItemActionType) { activity in
            if let slug = SpotlightIndex.slug(from: activity) { router.openHotel(slug: slug) }
        }
        // Fiyat düşüşü bildirimine dokunuldu.
        .onChange(of: push.pendingHotelSlug, initial: true) { _, slug in
            guard let slug else { return }
            push.pendingHotelSlug = nil
            router.openHotel(slug: slug)
        }
        .task {
            HotelLibrary.publish(in: context)
            await PriceAlerts.shared.refresh(slugs: HotelLibrary.savedSlugs(in: context), api: api)
        }
        // Uygulama öne gelince: bildirim izni olmasa da yeni cevap rozeti güncellenir.
        .task(id: scenePhase) {
            guard scenePhase == .active else { return }
            await InquiryLog.checkReplies(in: context, api: api)
        }
        .sheet(item: $push.pendingPage) { page in
            SafariView(url: page.url).ignoresSafeArea()
        }
        // Cevap bildirimi: dokunulduysa yazışma uygulamada açılır, yalnız
        // göründüyse rozet kalır. Talep bu cihazda kayıtlı değilse (silinmiş,
        // başka cihazdan gönderilmiş) bildirimin web sayfası açılır.
        .onChange(of: push.replyEvent, initial: true) { _, event in
            guard let event else { return }
            InquiryLog.markReply(inquiryId: event.inquiryId, unread: !event.opened, in: context)
            guard event.opened, InquiryLog.find(event.inquiryId, in: context)?.portalToken != nil else { return }
            push.pendingPage = nil
            router.openInquiry(id: event.inquiryId)
        }
        .fullScreenCover(item: $debugTour) { target in
            TourScreen(hotelSlug: target.hotelSlug, tourId: target.tourId)
                .environment(\.theme, theme)
                .tint(theme.primary)
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

    /// `OTS_STAY=2027-01-24,2027-01-27,2` ile tarih ve yetişkin seçili açılır
    /// (arayüz testi ve ekran görüntüleri fiyatı olan tarihleri kullanır).
    @MainActor static func stayStore() -> StayStore {
        #if DEBUG
        let parts = ProcessInfo.processInfo.environment["OTS_STAY"]?.split(separator: ",").map(String.init) ?? []
        // Test seçimi misafirin kayıtlı seçimine karışmasın: kalıcı olmayan depo.
        let store = parts.count >= 2 ? StayStore() : StayStore(defaults: .standard)
        let format = Date.ISO8601FormatStyle(timeZone: .current).year().month().day()
        if parts.count >= 2, let checkIn = try? Date(parts[0], strategy: format), let checkOut = try? Date(parts[1], strategy: format) {
            store.stay.checkIn = checkIn
            store.stay.checkOut = checkOut
            if parts.count >= 3, let adults = Int(parts[2]) { store.stay.adults = adults }
        }
        return store
        #else
        return StayStore(defaults: .standard)
        #endif
    }

    /// `OTS_RESET=1`: arayüz testleri temiz başlar (kayıtlı ayar yok, veriler bellekte).
    static var resetsState: Bool {
        #if DEBUG
        ProcessInfo.processInfo.environment["OTS_RESET"] == "1"
        #else
        false
        #endif
    }

    static func resetIfRequested() {
        guard resetsState, let bundleID = Bundle.main.bundleIdentifier else { return }
        UserDefaults.standard.removePersistentDomain(forName: bundleID)
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
        .modelContainer(for: [SavedHotel.self, RecentHotel.self, SentInquiry.self], inMemory: true)
}
