import SwiftUI

struct SearchView: View {
    @Environment(\.api) private var api
    @Environment(\.theme) private var theme
    @Environment(StayStore.self) private var store
    @State private var query = ""
    @State private var state: Loadable<[HotelCard]>?
    /// Sonuçlar ekrandayken yeni arama sürüyor: eski sonuçlar soluk kalır.
    @State private var isReloading = false

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 12) {
                switch state {
                case nil:
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Otel adı ya da şehir yazın.")
                            .font(theme.display(26, style: .title2))
                            .foregroundStyle(theme.isDark ? theme.text : theme.navy)
                        Text("Örneğin \"Afyon\", \"Pamukkale\" ya da \"Oruçoğlu\".")
                            .font(theme.body(15))
                            .foregroundStyle(theme.textDim)
                    }
                    .padding(.top, 8)
                case .loading:
                    VStack(spacing: 12) {
                        ForEach(0..<4, id: \.self) { _ in HotelRowSkeleton() }
                    }
                    .skeleton()
                case .failed(let error):
                    ErrorStateView(error: error) { await search() }
                case .loaded(let hotels) where hotels.isEmpty:
                    StateMessageView(
                        symbol: "magnifyingglass",
                        title: String(localized: "Sonuç yok"),
                        message: String(localized: "“\(query)” ile eşleşen otel bulunamadı. Otel adını ya da şehri deneyin.")
                    )
                case .loaded(let hotels):
                    VStack(alignment: .leading, spacing: 2) {
                        Text("\(hotels.count) sonuç")
                            .font(theme.body(14, weight: 600))
                            .foregroundStyle(theme.textDim)
                        // Keşfet'te seçilen tarih ve kişi aramada da geçerli.
                        if !store.stay.isEmpty {
                            Text([store.stay.datesSummary, store.stay.partySummary].compactMap(\.self).joined(separator: " · "))
                                .font(theme.body(13))
                                .foregroundStyle(theme.textDim)
                        }
                    }
                    ForEach(hotels) { hotel in
                        NavigationLink(value: hotel) { HotelRow(summary: hotel.summary, detail: hotel.highlights.joined(separator: " · ")) }
                            .buttonStyle(.pressScaleRow)
                            .accessibilityIdentifier("search-result-\(hotel.slug)")
                            .opacity(isReloading ? 0.45 : 1)
                    }
                }
            }
            .padding(16)
            .readableWidth()
        }
        .background(theme.bg)
        .brandedNavigationTitle(String(localized: "Ara"))
        .searchable(text: $query, placement: .navigationBarDrawer(displayMode: .always), prompt: "Otel, şehir…")
        .navigationDestination(for: HotelCard.self) { hotel in
            HotelDetailView(slug: hotel.slug, title: hotel.name)
        }
        .task(id: SearchKey(query: query, stay: store.stay)) {
            // Yazarken her tuşta istek atmamak için kısa bekleme.
            try? await Task.sleep(for: .milliseconds(350))
            guard !Task.isCancelled else { return }
            await search()
        }
    }

    /// Yazı ya da seçili konaklama değişince yeniden aranır.
    private struct SearchKey: Equatable {
        let query: String
        let stay: StaySearch
    }

    private func search() async {
        let text = query.trimmingCharacters(in: .whitespaces)
        guard text.count >= 2 else { state = nil; return }
        if state?.value == nil { state = .loading } else { isReloading = true }
        do {
            state = .loaded(try await api.hotels(query: text, stay: store.stay))
        } catch is CancellationError {
        } catch {
            state = .failed(APIError(error))
        }
        if !Task.isCancelled { isReloading = false }
    }
}

/// Liste satırı: küçük görsel, serif/sans başlık, şehir, ek bilgi.
struct HotelRow: View {
    @Environment(\.theme) private var theme
    let summary: HotelSummary
    var detail: String = ""

    var body: some View {
        HStack(spacing: 14) {
            RemoteImage(path: summary.imageUrl)
                .frame(width: 76, height: 76)
                .clipShape(.rect(cornerRadius: theme.radius, style: .continuous))
            VStack(alignment: .leading, spacing: 4) {
                Text(summary.name)
                    .font(theme.display(18, style: .headline))
                    .foregroundStyle(theme.isDark ? theme.text : theme.navy)
                    .lineLimit(2)
                if let city = summary.city {
                    Text(city).font(theme.body(14)).foregroundStyle(theme.textDim)
                }
                if !detail.isEmpty {
                    Text(detail).font(theme.body(13, weight: 600)).foregroundStyle(theme.textMuted).lineLimit(1)
                }
            }
            Spacer(minLength: 0)
            Image(systemName: "chevron.right").font(.footnote.weight(.semibold)).foregroundStyle(theme.textDim)
        }
        .padding(12)
        .cardSurface()
    }
}
