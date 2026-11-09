import SwiftUI

struct ExploreView: View {
    @Environment(\.api) private var api
    @Environment(\.theme) private var theme
    @Binding var season: Season
    @State private var state: Loadable<[HotelCard]> = .loading

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                header
                hero
                VStack(alignment: .leading, spacing: 20) {
                    content
                }
                .padding(.horizontal, 16)
                .padding(.top, 28)
                .padding(.bottom, 32)
            }
        }
        .background(theme.bg)
        .safeAreaInset(edge: .top, spacing: 0) {
            // Durum çubuğunun arkası başlık çubuğuyla aynı açık renk; kaydırılan
            // koyu banner saatin altına girmez. (Arka plan güvenli alana taşar.)
            Color.clear.frame(height: 0).background(theme.headerBackground)
        }
        .toolbar(.hidden, for: .navigationBar)
        .navigationDestination(for: HotelCard.self) { hotel in
            HotelDetailView(slug: hotel.slug, title: hotel.name)
        }
        .task(id: season) {
            state = .loading
            await load()
        }
        .refreshable { await load() }
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

    /// Web vitrin banner'ı: koyu degrade, büyük başlık, kısa açıklama.
    private var hero: some View {
        VStack(alignment: .leading, spacing: 18) {
            Text(season.headline)
                .font(theme.display(36, style: .largeTitle))
                .foregroundStyle(theme.inkOnDeep)
                .fixedSize(horizontal: false, vertical: true)
                .id(season)
                .transition(.opacity.combined(with: .move(edge: .bottom)))
            Text(season.lede)
                .font(theme.body(16))
                .foregroundStyle(theme.mutedOnDeep)
                .lineSpacing(4)
                .fixedSize(horizontal: false, vertical: true)
            if case .loaded(let hotels) = state, !hotels.isEmpty {
                HStack(spacing: 18) {
                    stat("\(hotels.count)", season.hotelsStat)
                    stat("\(hotels.filter { $0.tourId != nil }.count)", "video turlu")
                }
            }
        }
        .padding(.horizontal, 20)
        .padding(.top, 28)
        .padding(.bottom, 32)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(DeepBackground())
    }

    private func stat(_ value: String, _ label: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(value).font(theme.display(26, style: .title2)).foregroundStyle(theme.sand)
            Text(label).font(theme.body(13)).foregroundStyle(theme.mutedOnDeep)
        }
    }

    @ViewBuilder private var content: some View {
        switch state {
        case .loading:
            ProgressView().frame(maxWidth: .infinity).padding(.top, 60)
        case .failed(let message):
            ErrorStateView(message: message) { await load() }
        case .loaded(let hotels) where hotels.isEmpty:
            ContentUnavailableView("Bu sezonda otel yok", systemImage: season.symbol, description: Text("Yakında yeni oteller eklenecek."))
        case .loaded(let hotels):
            VStack(alignment: .leading, spacing: 6) {
                Eyebrow("Öne çıkan oteller")
                Text("Gitmeden gezin, sonra karar verin.")
                    .font(theme.display(26, style: .title2))
                    .foregroundStyle(theme.isDark ? theme.text : theme.navy)
            }
            LazyVStack(spacing: 20) {
                ForEach(hotels) { hotel in
                    NavigationLink(value: hotel) {
                        HotelCardView(hotel: hotel)
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("hotel-card-\(hotel.slug)")
                }
            }
        }
    }

    private func load() async {
        do {
            state = .loaded(try await api.hotels(season: season))
        } catch is CancellationError {
        } catch {
            state = .failed(error.localizedDescription)
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
            }
        }
    }
}

#Preview {
    @Previewable @State var season: Season = .termal
    NavigationStack { ExploreView(season: $season) }
        .environment(\.theme, .forSeason(season))
        .modelContainer(for: [SavedHotel.self, RecentHotel.self], inMemory: true)
}

#Preview("Kış") {
    @Previewable @State var season: Season = .kis
    NavigationStack { ExploreView(season: $season) }
        .environment(\.theme, .forSeason(season))
        .preferredColorScheme(.dark)
        .modelContainer(for: [SavedHotel.self, RecentHotel.self], inMemory: true)
}

#Preview("Yaz") {
    @Previewable @State var season: Season = .yaz
    NavigationStack { ExploreView(season: $season) }
        .environment(\.theme, .forSeason(season))
        .modelContainer(for: [SavedHotel.self, RecentHotel.self], inMemory: true)
}
