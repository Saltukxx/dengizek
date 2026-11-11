import SwiftUI

/// Oda sayfası (web: /oteller/{otel}/rooms/{oda}): galeri, oda bilgileri,
/// seçilen tarihlerin fiyatı, oda turu ve bu oda için talep.
struct RoomDetailView: View {
    @Environment(\.api) private var api
    @Environment(\.theme) private var theme
    @Environment(StayStore.self) private var store
    let hotel: HotelDetail
    let room: Room

    @State private var quoteState: QuoteState = .idle
    @State private var showsStay = false
    @State private var showsInquiry = false
    @State private var showsFullDescription = false
    @State private var playingTour: HotelDetail.Tour?

    private var roomTour: HotelDetail.Tour? { hotel.tours.first { $0.roomSlug == room.slug } }
    private var roomQuote: RoomQuote? { quoteState.quote?.rooms.first { $0.slug == room.slug } }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 28) {
                gallery
                header
                    .padding(.horizontal, 16)
                if let tour = roomTour {
                    Button { playingTour = tour } label: {
                        Label("Odayı video turla gez", systemImage: "play.fill")
                    }
                    .buttonStyle(.otsPrimary)
                    .padding(.horizontal, 16)
                }
                facts
                    .padding(.horizontal, 16)
                section(String(localized: "Fiyat")) { price }
                if let text = room.description, !text.isEmpty { section(String(localized: "Oda hakkında")) { description(text) } }
                if !room.amenities.isEmpty { section(String(localized: "Odada neler var?")) { amenities } }
            }
            .padding(.bottom, 40)
            .readableWidth()
        }
        .background(theme.bg)
        .safeAreaInset(edge: .bottom, spacing: 0) { actionBar }
        .brandedNavigationTitle(room.name)
        .toolbarBackgroundVisibility(.visible, for: .navigationBar)
        .task(id: store.stay) { await loadQuote() }
        .sheet(isPresented: $showsStay) {
            @Bindable var store = store
            StaySheet(title: String(localized: "Tarih ve kişi"), confirmTitle: String(localized: "Fiyatı göster"), stay: $store.stay)
                .environment(\.theme, theme)
        }
        .sheet(isPresented: $showsInquiry) {
            InquiryView(hotelSlug: hotel.slug, hotelName: hotel.name, hotelImageUrl: hotel.imageUrl, rooms: hotel.rooms, source: .hotelPage, stay: store.stay, roomSlug: room.slug)
                .environment(\.theme, theme)
        }
        .fullScreenCover(item: $playingTour) { tour in
            TourScreen(hotelSlug: hotel.slug, tourId: tour.tourId)
                .environment(\.theme, theme)
                .tint(theme.primary)
        }
    }

    // MARK: Bölümler

    @ViewBuilder private var gallery: some View {
        let images = room.images
        if !images.isEmpty {
            PagedGallery(urls: images, label: String(localized: "\(room.name) fotoğrafları"))
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(hotel.name)
                .font(theme.body(14, weight: 600))
                .foregroundStyle(theme.textDim)
            Text(room.name)
                .font(theme.display(30, style: .largeTitle))
                .foregroundStyle(theme.isDark ? theme.text : theme.navy)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.isHeader)
            if let tagline = room.tagline, !tagline.isEmpty {
                Text(tagline)
                    .font(theme.body(16))
                    .foregroundStyle(theme.textMuted)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    /// Kapasite, büyüklük, yatak, manzara, pansiyon: ikonlu iki sütun.
    private var facts: some View {
        let rows = factRows
        return LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], alignment: .leading, spacing: 10) {
            ForEach(rows, id: \.label) { row in
                HStack(alignment: .top, spacing: 10) {
                    Image(systemName: row.symbol)
                        .font(.system(size: 17, weight: .medium))
                        .foregroundStyle(theme.primary)
                        .frame(width: 22)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(row.label)
                            .font(theme.body(12))
                            .foregroundStyle(theme.textDim)
                        Text(row.value)
                            .font(theme.body(15, weight: 600))
                            .foregroundStyle(theme.text)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    Spacer(minLength: 0)
                }
                .padding(12)
                .frame(maxHeight: .infinity, alignment: .top)
                .background(theme.surface2, in: .rect(cornerRadius: theme.radiusMedium, style: .continuous))
                .accessibilityElement(children: .combine)
            }
        }
    }

    private var factRows: [(label: String, value: String, symbol: String)] {
        var rows: [(String, String, String)] = [(String(localized: "Kapasite"), room.capacityText, "person.2")]
        if let size = room.sizeSqm, size > 0 { rows.append((String(localized: "Büyüklük"), "\(size) m²", "square.dashed")) }
        if let bed = room.bedConfig, !bed.isEmpty { rows.append((String(localized: "Yatak"), bed, "bed.double")) }
        if let view = room.viewType, !view.isEmpty { rows.append((String(localized: "Manzara"), view, "mountain.2")) }
        rows.append((String(localized: "Pansiyon"), room.boardLabel, "fork.knife"))
        return rows.map { (label: $0.0, value: $0.1, symbol: $0.2) }
    }

    @ViewBuilder private var price: some View {
        VStack(alignment: .leading, spacing: 12) {
            StaySummaryButton(stay: store.stay) { showsStay = true }
            switch quoteState {
            case .idle:
                note(String(localized: "Giriş ve çıkış tarihi seçince bu odanın toplam fiyatı burada görünür."), symbol: "info.circle")
            case .loading:
                ProgressView("Fiyat hesaplanıyor…")
                    .font(theme.body(14))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 16)
            case .failed(let message):
                VStack(alignment: .leading, spacing: 10) {
                    note(message, symbol: "exclamationmark.triangle")
                    Button("Tekrar dene", systemImage: "arrow.clockwise") { Task { await loadQuote() } }
                        .buttonStyle(.otsOutline)
                        .fixedSize()
                }
            case .loaded(let quote):
                if let roomQuote, roomQuote.fit == .no {
                    note(String(localized: "Bu oda \(room.capacityText) alır; seçtiğiniz kişi sayısı için uygun değil."), symbol: "person.2.slash")
                } else if let roomQuote {
                    RoomQuotePrice(quote: roomQuote, nights: quote.nights)
                        .padding(16)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .cardSurface()
                } else {
                    note(String(localized: "Bu odanın fiyatı henüz girilmemiş. Talep gönderin, ekibimiz fiyatı size bildirsin."), symbol: "envelope")
                }
            }
        }
    }

    private func description(_ text: String) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(text)
                .font(theme.body(16))
                .foregroundStyle(theme.textMuted)
                .lineSpacing(5)
                .lineLimit(showsFullDescription ? nil : 8)
            if text.count > 400 {
                Button(showsFullDescription ? String(localized: "Daha az göster") : String(localized: "Devamını oku")) {
                    withAnimation { showsFullDescription.toggle() }
                }
                .font(theme.body(15, weight: 600))
                .foregroundStyle(theme.primary)
                .frame(minHeight: 44)
                .contentShape(.rect)
            }
        }
    }

    private var amenities: some View {
        LazyVGrid(columns: [GridItem(.flexible(), alignment: .leading), GridItem(.flexible(), alignment: .leading)], alignment: .leading, spacing: 12) {
            ForEach(room.amenities, id: \.self) { amenity in
                Label {
                    Text(amenity).fixedSize(horizontal: false, vertical: true)
                } icon: {
                    Image(systemName: AmenityIcon.symbol(for: amenity)).foregroundStyle(theme.primary)
                }
                .font(theme.body(15))
                .foregroundStyle(theme.text)
            }
        }
    }

    // MARK: Alt çubuk

    private var actionBar: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 0) {
                if let quote = quoteState.quote, let roomQuote, roomQuote.isBookable, let total = roomQuote.totalMinor {
                    RollingAmount(minor: total, currency: roomQuote.currency)
                        .font(theme.display(22, style: .title3))
                        .foregroundStyle(theme.isDark ? theme.text : theme.navy)
                        .minimumScaleFactor(0.8)
                        .lineLimit(1)
                    Text("\(quote.nights) gece toplam")
                        .font(theme.body(12))
                        .foregroundStyle(theme.textDim)
                } else {
                    Text(room.name)
                        .font(theme.body(15, weight: 700))
                        .foregroundStyle(theme.text)
                        .lineLimit(1)
                    Text(room.boardLabel)
                        .font(theme.body(12))
                        .foregroundStyle(theme.textDim)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .accessibilityElement(children: .combine)
            Button("Talep gönder") { showsInquiry = true }
                .buttonStyle(.otsCTA)
                .fixedSize()
                .accessibilityIdentifier("room.inquiry")
        }
        .padding(.horizontal, 16)
        .padding(.top, 10)
        .padding(.bottom, 6)
        .background {
            theme.bg.opacity(0.94)
                .background(.ultraThinMaterial)
                .ignoresSafeArea(edges: .bottom)
        }
        .overlay(alignment: .top) { Rectangle().fill(theme.line).frame(height: 1) }
    }

    // MARK: Yardımcılar

    private func section<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            Text(title)
                .font(theme.display(24, style: .title2))
                .foregroundStyle(theme.isDark ? theme.text : theme.navy)
                .accessibilityAddTraits(.isHeader)
            content()
        }
        .padding(.horizontal, 16)
    }

    private func note(_ text: String, symbol: String) -> some View {
        Label(text, systemImage: symbol)
            .font(theme.body(14))
            .foregroundStyle(theme.textMuted)
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(theme.surface2, in: .rect(cornerRadius: theme.radiusMedium, style: .continuous))
    }

    private func loadQuote() async {
        if store.stay.hasDates { quoteState = .loading }
        if let next = await api.quoteState(hotelSlug: hotel.slug, stay: store.stay) { quoteState = next }
    }
}
