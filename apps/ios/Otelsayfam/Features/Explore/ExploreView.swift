import SwiftUI

struct ExploreView: View {
    @Environment(\.api) private var api
    @Environment(\.theme) private var theme
    @Environment(StayStore.self) private var store
    @Binding var season: Season
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.horizontalSizeClass) private var sizeClass
    @State private var state: Loadable<[HotelCard]> = .loading
    @State private var showsSearch = false
    /// Liste ekrandayken yenisi yükleniyor: eski liste soluk kalır, silinmez.
    @State private var isReloading = false
    /// Bağlantı yok; gösterilen liste son kayıt.
    @State private var isStale = false
    @Namespace private var cardZoom

    /// Liste bu üçü değişince yeniden yüklenir.
    private struct LoadKey: Equatable {
        let season: Season
        let stay: StaySearch
        let filters: BrowseFilters
    }

    private var isFiltered: Bool { !store.stay.isEmpty || store.filters != BrowseFilters() }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                header
                hero
                searchBar
                    .padding(.horizontal, 16)
                    .padding(.top, -26)
                VStack(alignment: .leading, spacing: 20) {
                    content
                }
                .padding(.horizontal, 16)
                .padding(.top, 24)
                .padding(.bottom, 32)
            }
        }
        .background(theme.bg)
        .safeAreaInset(edge: .top, spacing: 0) {
            // Durum çubuğunun arkası başlık çubuğuyla aynı açık renk; kaydırılan
            // koyu banner saatin altına girmez. (Arka plan güvenli alana taşar.)
            Color.clear.frame(height: 0).background(theme.headerBackground)
        }
        .toolbarVisibility(.hidden, for: .navigationBar)
        .navigationDestination(for: HotelCard.self) { hotel in
            HotelDetailView(slug: hotel.slug, title: hotel.name)
                .navigationTransition(.zoom(sourceID: hotel.slug, in: cardZoom))
        }
        // Derin bağlantı (paylaşılan adres, bildirim) yalnız otelin kısa adını taşır.
        .navigationDestination(for: HotelSummary.self) { hotel in
            HotelDetailView(slug: hotel.slug, title: hotel.name)
        }
        .task(id: LoadKey(season: season, stay: store.stay, filters: store.filters)) {
            if state.value == nil { state = .loading } else { isReloading = true }
            await load()
            // İptal edilen yüklemenin ardından yenisi başlamıştır; onun işaretini silme.
            if !Task.isCancelled { isReloading = false }
        }
        .refreshable { await load() }
        .sheet(isPresented: $showsSearch) {
            @Bindable var store = store
            StaySheet(title: String(localized: "Tarih, kişi ve filtre"), confirmTitle: String(localized: "Otelleri göster"), stay: $store.stay, filters: $store.filters)
                .environment(\.theme, theme)
        }
    }

    /// Banner'ın altına taşan arama kartı: tarih, kişi ve filtre sayısı.
    private var searchBar: some View {
        StaySummaryButton(stay: store.stay, filterCount: store.filters.activeCount) { showsSearch = true }
            // Arama değişince (pencereden ya da etiket kaldırılınca) hafif bir dokunuş.
            .sensoryFeedback(.impact(weight: .light), trigger: store.filters)
            .sensoryFeedback(.selection, trigger: store.stay)
    }

    /// Seçili filtreler: dokununca kaldırılır.
    @ViewBuilder private var activeChips: some View {
        let chips = activeChipList
        if !chips.isEmpty {
            ScrollView(.horizontal) {
                HStack(spacing: 8) {
                    ForEach(chips, id: \.title) { chip in
                        Button {
                            withAnimation { chip.remove() }
                        } label: {
                            HStack(spacing: 6) {
                                Text(chip.title)
                                Image(systemName: "xmark").font(.system(size: 10, weight: .bold))
                            }
                            .font(theme.body(13, weight: 600))
                            .foregroundStyle(theme.isDark ? theme.text : theme.primary)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 7)
                            .background(theme.surface2, in: .capsule)
                            // Görünen etiket küçük; dokunma alanı 44 pt.
                            .frame(minHeight: 44)
                            .contentShape(.rect)
                        }
                        .buttonStyle(.pressScale)
                        .accessibilityLabel("\(chip.title) filtresini kaldır")
                    }
                }
            }
            .scrollIndicators(.hidden)
            .padding(.horizontal, -16)
            .contentMargins(.horizontal, 16, for: .scrollContent)
        }
    }

    private var activeChipList: [(title: String, remove: () -> Void)] {
        // Tarih ve kişi arama kartında yazıyor; burada yalnız filtreler.
        var chips: [(String, () -> Void)] = []
        if store.filters.tourOnly { chips.append((String(localized: "Video turu olanlar"), { store.filters.tourOnly = false })) }
        if store.filters.promoOnly { chips.append((String(localized: "Kampanyalı"), { store.filters.promoOnly = false })) }
        if store.filters.petsOnly { chips.append((String(localized: "Evcil hayvan"), { store.filters.petsOnly = false })) }
        if let band = store.filters.priceBand { chips.append((band.title, { store.filters.priceBand = nil })) }
        if store.filters.sort != .recommended { chips.append((store.filters.sort.title, { store.filters.sort = .recommended })) }
        return chips.map { (title: $0.0, remove: $0.1) }
    }

    /// Web başlık çubuğu (.er-header): açık zemin, marka, sezon geçişi, altta renkli çizgi.
    /// Durum çubuğu bu açık zeminin üstünde kalır, her temada okunur.
    private var header: some View {
        HStack(alignment: .firstTextBaseline) {
            Text("Otelsayfam")
                .font(theme.display(26, style: .title2))
                .foregroundStyle(theme.season == .yaz ? theme.navy : (theme.isDark ? theme.text : theme.primary))
            Spacer()
            SeasonSwitcher(season: $season)
        }
        .padding(.horizontal, 20)
        .padding(.top, 8)
        .padding(.bottom, 12)
        .background(theme.headerBackground)
        .overlay(alignment: .bottom) {
            Rectangle().fill(theme.headerRule).frame(height: 2)
        }
    }

    /// Vitrin banner'ı: kısa ve sıkı. İlk ekranda otel kartı da görünsün diye
    /// açıklama iki satırla sınırlı; sayılar bölüm başlığına taşındı.
    private var hero: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(season.headline)
                .font(theme.display(30, style: .largeTitle))
                .foregroundStyle(theme.inkOnDeep)
                .fixedSize(horizontal: false, vertical: true)
                .id(season)
                .transition(reduceMotion ? AnyTransition.opacity : .opacity.combined(with: .move(edge: .bottom)))
            Text(season.lede)
                .font(theme.body(15))
                .foregroundStyle(theme.mutedOnDeep)
                .lineSpacing(3)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.horizontal, 20)
        .padding(.top, 24)
        .padding(.bottom, 50)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(DeepBackground())
    }

    @ViewBuilder private var content: some View {
        switch state {
        case .loading:
            VStack(alignment: .leading, spacing: 20) {
                SkeletonBlock(width: 200, height: 24)
                LazyVGrid(columns: columns, spacing: 20) {
                    ForEach(0..<(sizeClass == .regular ? 6 : 3), id: \.self) { _ in HotelCardSkeleton() }
                }
            }
            .skeleton()
        case .failed(let error):
            ErrorStateView(error: error) { await load() }
        case .loaded(let hotels) where hotels.isEmpty && isFiltered:
            activeChips
            StateMessageView(symbol: "line.3.horizontal.decrease.circle", title: String(localized: "Uygun otel yok"), message: String(localized: "Seçtiğiniz tarih, kişi ya da filtrelere uyan otel bulamadık. Birini kaldırıp tekrar bakın.")) {
                Button("Filtreleri temizle") {
                    withAnimation {
                        store.stay = StaySearch()
                        store.filters = BrowseFilters()
                    }
                }
                .buttonStyle(.otsOutline)
                .fixedSize()
            }
        case .loaded(let hotels) where hotels.isEmpty:
            StateMessageView(symbol: season.symbol, title: String(localized: "Bu sezonda otel yok"), message: String(localized: "Yakında yeni oteller eklenecek. Diğer sezonlara üstteki seçiciden bakabilirsiniz."))
        case .loaded(let hotels):
            if isStale { OfflineNotice() }
            activeChips
            VStack(alignment: .leading, spacing: 4) {
                Text(isFiltered ? String(localized: "\(hotels.count) otel uygun") : season.hotelsStat(hotels.count))
                    .font(theme.display(24, style: .title2))
                    .foregroundStyle(theme.isDark ? theme.text : theme.navy)
                    .accessibilityAddTraits(.isHeader)
                if store.stay.hasDates {
                    Text("Otele dokunun, seçtiğiniz tarihlerin oda fiyatlarını görün.")
                        .font(theme.body(14))
                        .foregroundStyle(theme.textDim)
                }
            }
            // Web'deki gibi: birkaç otelden sonra Otelsayfam'ı anlatan bölümler.
            // Misafir arama yapıyorsa sonuçların arasına girmez.
            let lead = isFiltered ? hotels.count : min(showcaseAfter, hotels.count)
            VStack(spacing: 20) {
                hotelGrid(Array(hotels.prefix(lead)))
                if !isFiltered {
                    showcase
                    hotelGrid(Array(hotels.dropFirst(lead)))
                }
            }
            .opacity(isReloading ? 0.45 : 1)
            .allowsHitTesting(!isReloading)
            .animation(.easeOut(duration: 0.2), value: isReloading)
        }
    }

    /// Tanıtım bölümleri bu kadar otel kartından sonra gelir. Geniş ekranda
    /// kartlar yan yana durur; satır yarım kalmasın diye 2 ve 3'e bölünen sayı.
    private var showcaseAfter: Int { sizeClass == .regular ? 6 : 3 }

    /// Telefonda tek sütun, geniş ekranda (iPad) sığdığı kadar sütun.
    private var columns: [GridItem] {
        sizeClass == .regular
            ? [GridItem(.adaptive(minimum: 340), spacing: 20, alignment: .top)]
            : [GridItem(.flexible())]
    }

    @ViewBuilder private func hotelGrid(_ hotels: [HotelCard]) -> some View {
        if !hotels.isEmpty {
            LazyVGrid(columns: columns, spacing: 20) {
                ForEach(hotels) { hotel in
                    NavigationLink(value: hotel) {
                        HotelCardView(hotel: hotel)
                    }
                    .buttonStyle(.pressScale)
                    .matchedTransitionSource(id: hotel.slug, in: cardZoom)
                    .accessibilityIdentifier("hotel-card-\(hotel.slug)")
                }
            }
        }
    }

    private var showcase: some View {
        VStack(alignment: .leading, spacing: 32) {
            ShowcaseCompareSection()
            ShowcaseAiSection(season: season)
                .padding(.horizontal, -16)
        }
        .padding(.vertical, 16)
    }

    private func load() async {
        do {
            let fetched = try await api.browse(season: season, stay: store.stay, filters: store.filters)
            isStale = fetched.isStale
            state = .loaded(fetched.value)
        } catch is CancellationError {
        } catch {
            state = .failed(APIError(error))
        }
    }
}

/// Web başlığındaki "Yaz · Kış · Termal" geçişi: seçili olanın altı çizili.
private struct SeasonSwitcher: View {
    @Environment(\.theme) private var theme
    @Binding var season: Season
    @Namespace private var underline

    private let order: [Season] = [.yaz, .kis, .termal]

    var body: some View {
        HStack(spacing: 14) {
            ForEach(order) { item in
                Button {
                    withAnimation(.snappy) { season = item }
                } label: {
                    VStack(spacing: 4) {
                        Text(item.title)
                            .font(theme.body(15, weight: item == season ? 700 : 500))
                            .foregroundStyle(item == season ? theme.text : theme.textDim)
                        ZStack {
                            Capsule().fill(.clear).frame(height: 2)
                            if item == season {
                                Capsule().fill(theme.headerRule).frame(height: 2)
                                    .matchedGeometryEffect(id: "underline", in: underline)
                            }
                        }
                    }
                    .fixedSize()
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(item == season ? .isSelected : [])
                .sensoryFeedback(.selection, trigger: season) { _, new in new == item }
            }
        }
    }
}

#Preview {
    @Previewable @State var season: Season = .termal
    NavigationStack { ExploreView(season: $season) }
        .environment(\.theme, .forSeason(season))
        .environment(StayStore())
        .modelContainer(for: [SavedHotel.self, RecentHotel.self, SentInquiry.self], inMemory: true)
}

#Preview("Kış") {
    @Previewable @State var season: Season = .kis
    NavigationStack { ExploreView(season: $season) }
        .environment(\.theme, .forSeason(season))
        .preferredColorScheme(.dark)
        .environment(StayStore())
        .modelContainer(for: [SavedHotel.self, RecentHotel.self, SentInquiry.self], inMemory: true)
}

#Preview("Yaz") {
    @Previewable @State var season: Season = .yaz
    NavigationStack { ExploreView(season: $season) }
        .environment(\.theme, .forSeason(season))
        .environment(StayStore())
        .modelContainer(for: [SavedHotel.self, RecentHotel.self, SentInquiry.self], inMemory: true)
}
