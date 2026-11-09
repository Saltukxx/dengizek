import SwiftUI

struct SearchView: View {
    @Environment(\.api) private var api
    @Environment(\.theme) private var theme
    @State private var query = ""
    @State private var state: Loadable<[HotelCard]>?

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 12) {
                switch state {
                case nil:
                    VStack(alignment: .leading, spacing: 8) {
                        Eyebrow("Otel ara")
                        Text("Otel adı ya da şehir yazın.")
                            .font(theme.display(26, style: .title2))
                            .foregroundStyle(theme.isDark ? theme.text : theme.navy)
                        Text("Örneğin \"Afyon\", \"Pamukkale\" ya da \"Oruçoğlu\".")
                            .font(theme.body(15))
                            .foregroundStyle(theme.textDim)
                    }
                    .padding(.top, 8)
                case .loading:
                    ProgressView().frame(maxWidth: .infinity).padding(.top, 40)
                case .failed(let message):
                    ErrorStateView(message: message) { await search() }
                case .loaded(let hotels) where hotels.isEmpty:
                    ContentUnavailableView.search(text: query)
                case .loaded(let hotels):
                    Eyebrow("\(hotels.count) sonuç")
                    ForEach(hotels) { hotel in
                        NavigationLink(value: hotel) { HotelRow(summary: hotel.summary, detail: hotel.highlights.joined(separator: " · ")) }
                            .buttonStyle(.plain)
                            .accessibilityIdentifier("search-result-\(hotel.slug)")
                    }
                }
            }
            .padding(16)
        }
        .background(theme.bg)
        .navigationTitle("Ara")
        .searchable(text: $query, prompt: "Otel, şehir…")
        .navigationDestination(for: HotelCard.self) { hotel in
            HotelDetailView(slug: hotel.slug, title: hotel.name)
        }
        .task(id: query) {
            // Yazarken her tuşta istek atmamak için kısa bekleme.
            try? await Task.sleep(for: .milliseconds(350))
            guard !Task.isCancelled else { return }
            await search()
        }
    }

    private func search() async {
        let text = query.trimmingCharacters(in: .whitespaces)
        guard text.count >= 2 else { state = nil; return }
        state = .loading
        do {
            state = .loaded(try await api.hotels(query: text))
        } catch is CancellationError {
        } catch {
            state = .failed(error.localizedDescription)
        }
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
