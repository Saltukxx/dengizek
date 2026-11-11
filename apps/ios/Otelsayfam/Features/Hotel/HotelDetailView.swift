import MapKit
import SwiftData
import SwiftUI

struct HotelDetailView: View {
    @Environment(\.api) private var api
    @Environment(\.theme) private var theme
    let slug: String
    let title: String
    @State private var state: Loadable<HotelDetail> = .loading
    @State private var isStale = false

    var body: some View {
        Group {
            switch state {
            case .loading:
                HotelDetailSkeleton()
            case .failed(let error):
                ErrorStateView(subject: .hotel, error: error) { await load() }
            case .loaded(let hotel):
                HotelDetailContent(hotel: hotel, isStale: isStale)
            }
        }
        .background(theme.bg)
        .navigationTitle(shownTitle)
        .navigationBarTitleDisplayMode(.inline)
        // Gezinme çubuğu açık zeminde: durum çubuğu ve başlık her temada okunur.
        .toolbarBackground(theme.headerBackground, for: .navigationBar)
        .toolbarBackgroundVisibility(.visible, for: .navigationBar)
        .toolbarColorScheme(theme.isDark ? .dark : .light, for: .navigationBar)
        .toolbar {
            // Başlık rengi sabit: iOS altındaki koyu banner'a bakıp beyaza çevirebiliyor.
            ToolbarItem(placement: .principal) {
                Text(shownTitle)
                    .font(theme.body(16, weight: 700, style: .headline))
                    .foregroundStyle(theme.text)
                    .lineLimit(1)
            }
        }
        .task { await load() }
    }

    /// Derin bağlantıyla gelindiyse ad bilinmez; otel yüklenince ondan alınır.
    private var shownTitle: String {
        if case .loaded(let hotel) = state { return hotel.name }
        return title
    }

    private func load() async {
        do {
            let fetched = try await api.hotelPageData(slug: slug)
            isStale = fetched.isStale
            state = .loaded(fetched.value)
        } catch is CancellationError {
        } catch {
            state = .failed(APIError(error))
        }
    }
}

private struct HotelDetailContent: View {
    @Environment(\.api) private var api
    @Environment(\.theme) private var theme
    @Environment(\.modelContext) private var context
    @Environment(StayStore.self) private var store
    let hotel: HotelDetail
    var isStale = false
    @State private var quoteState: QuoteState = .idle
    @State private var showsStay = false
    @State private var showsFullDescription = false
    @State private var playingTour: HotelDetail.Tour?
    /// Sohbet sayfa açık kaldıkça korunur (sheet kapanıp açılınca kaybolmaz).
    @State private var guide: GuideModel?
    /// Gösterilen sohbet. `sheet(item:)` ile: `isPresented` + ayrı opsiyonel
    /// durumda sheet ilk açılışta modeli nil görüp boş açılıyordu.
    @State private var presentedGuide: GuideModel?
    @State private var showsInquiry = false
    @State private var showsAmenities = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                banner
                gallery
                    .padding(.horizontal, 16)
                    .readableWidth()
                    .padding(.top, -64)
                VStack(alignment: .leading, spacing: 32) {
                    if isStale { OfflineNotice().padding(.horizontal, 16) }
                    if let tour = hotel.tours.first { tourButton(tour) }
                    prices
                    description
                    if !hotel.amenities.isEmpty { amenities }
                    if !hotel.rooms.isEmpty { rooms }
                    if let reviews = hotel.reviews, reviews.count > 0 {
                        SectionBlock(title: String(localized: "Misafir yorumları")) { ReviewsSection(reviews: reviews) }
                    }
                    policies
                    if let location = hotel.location { map(location) }
                }
                .readableWidth()
                .padding(.top, 24)
                .padding(.bottom, 40)
            }
        }
        .background(theme.bg)
        .safeAreaInset(edge: .bottom, spacing: 0) { actionBar }
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                ShareLink(item: api.hotelPage(slug: hotel.slug), subject: Text(hotel.name), message: Text(shareMessage)) {
                    Label("Paylaş", systemImage: "square.and.arrow.up")
                }
                .accessibilityIdentifier("hotel.share")
            }
            ToolbarItem(placement: .topBarTrailing) { SaveButton(hotel: hotel.summary, style: .toolbar) }
        }
        .onAppear { HotelLibrary.recordView(hotel.summary, in: context) }
        .task(id: store.stay) { await loadQuote() }
        .navigationDestination(for: RoomRoute.self) { route in
            RoomDetailView(hotel: route.hotel, room: route.room)
        }
        .sheet(isPresented: $showsStay) {
            @Bindable var store = store
            StaySheet(title: String(localized: "Tarih ve kişi"), confirmTitle: String(localized: "Fiyatları göster"), stay: $store.stay)
                .environment(\.theme, theme)
        }
        .fullScreenCover(item: $playingTour) { tour in
            TourScreen(hotelSlug: hotel.slug, tourId: tour.tourId)
                .environment(\.theme, theme)
                .tint(theme.primary)
        }
        .sheet(item: $presentedGuide) { guide in
            GuideView(model: guide) { question in
                inquiryForm(source: .guide, message: question)
            }
            .environment(\.theme, theme)
        }
        .sheet(isPresented: $showsInquiry) {
            inquiryForm(source: .hotelPage, message: "")
                .environment(\.theme, theme)
        }
        .sheet(isPresented: $showsAmenities) {
            AmenityListSheet(amenities: hotel.amenities)
                .environment(\.theme, theme)
        }
    }

    /// "Oruçoğlu Thermal Hotel, Afyonkarahisar"
    private var shareMessage: String {
        [hotel.name, hotel.city].compactMap(\.self).joined(separator: ", ")
    }

    // MARK: Banner (web: koyu degrade, yol, büyük ad, konum)

    private var banner: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 8) {
                Text("Oteller").foregroundStyle(theme.sand)
                Image(systemName: "chevron.right").font(.caption2).foregroundStyle(theme.mutedOnDeep)
                Text([hotel.city, hotel.country].compactMap(\.self).joined(separator: ", "))
                    .foregroundStyle(theme.mutedOnDeep)
            }
            .font(theme.body(14))
            Text(hotel.name)
                .font(theme.display(34, style: .largeTitle))
                .foregroundStyle(theme.inkOnDeep)
                .fixedSize(horizontal: false, vertical: true)
            // Şehir yol satırında yazıyor; burada yalnız açık adres (varsa) ve yıldız.
            HStack(spacing: 12) {
                if let address = hotel.location?.address, address != hotel.city {
                    Label(address, systemImage: "mappin.and.ellipse")
                        .font(theme.body(15))
                        .foregroundStyle(theme.mutedOnDeep)
                        .lineLimit(1)
                }
                if let stars = hotel.starRating, stars > 0 {
                    HStack(spacing: 2) {
                        ForEach(0..<stars, id: \.self) { _ in Image(systemName: "star.fill") }
                    }
                    .font(.caption)
                    .foregroundStyle(theme.sand)
                    .accessibilityElement()
                    .accessibilityLabel("\(stars) yıldızlı")
                }
                if let reviews = hotel.reviews, let average = reviews.average, reviews.count > 0 {
                    Text("\(Formatting.rating(average)) · \(reviews.count) yorum")
                        .font(theme.body(14, weight: 700))
                        .foregroundStyle(theme.inkOnDeep)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 5)
                        .background(.white.opacity(0.14), in: .rect(cornerRadius: theme.radiusSmall))
                        .accessibilityLabel("Misafir puanı 5 üzerinden \(Formatting.rating(average)), \(reviews.count) yorum")
                }
            }
        }
        .padding(.horizontal, 20)
        .padding(.top, 24)
        .padding(.bottom, 88)
        .frame(maxWidth: 760, alignment: .leading)
        .frame(maxWidth: .infinity)
        .background(DeepBackground())
    }

    // MARK: Galeri (banner'ın üstüne taşan, sayaçlı)

    private var gallery: some View {
        let images = hotel.gallery.isEmpty ? [HotelDetail.GalleryImage(url: hotel.imageUrl ?? "", caption: nil)] : hotel.gallery
        return PagedGallery(
            urls: images.map(\.url),
            captions: images.map(\.caption),
            label: String(localized: "\(hotel.name) fotoğrafları"),
            cornerRadius: theme.radiusLarge
        )
        .shadow(color: theme.shadow, radius: 16, y: 8)
    }

    // MARK: Eylemler

    /// Sayfadaki tek büyük düğme: otelin kendisini göstermek.
    private func tourButton(_ tour: HotelDetail.Tour) -> some View {
        Button { playingTour = tour } label: {
            Label("Oteli video turla gez", systemImage: "play.fill")
        }
        .buttonStyle(.otsPrimary)
        .accessibilityIdentifier("hotel.tour")
        .padding(.horizontal, 16)
    }

    /// Altta sabit çubuk: fiyat, rehber ve talep. Misafir sayfanın neresinde
    /// olursa olsun fiyatı görür, sorar ya da talep gönderir. Talep tek dolu düğme.
    private var actionBar: some View {
        HStack(spacing: 10) {
            priceSummary
                .frame(maxWidth: .infinity, alignment: .leading)
            Button(action: openGuide) {
                GuideAvatar(size: 28)
                    .frame(width: 50, height: 50)
                    .background(theme.surface, in: .rect(cornerRadius: theme.radius, style: .continuous))
                    .overlay { RoundedRectangle(cornerRadius: theme.radius).strokeBorder(theme.lineStrong) }
            }
            .buttonStyle(PressScaleButtonStyle(scale: 0.92))
            .accessibilityLabel("Yapay zekâ rehberine sor")
            .accessibilityIdentifier("hotel.guide")
            Button { showsInquiry = true } label: {
                Text("Talep gönder")
            }
            .buttonStyle(.otsCTA)
            .fixedSize()
            .accessibilityHint("Ekibimiz talebinize e-postayla dönüş yapar.")
            .accessibilityIdentifier("hotel.inquiry")
        }
        .padding(.horizontal, 16)
        .readableWidth()
        .padding(.top, 10)
        .padding(.bottom, 6)
        .background {
            theme.bg.opacity(0.94)
                .background(.ultraThinMaterial)
                .ignoresSafeArea(edges: .bottom)
        }
        .overlay(alignment: .top) { Rectangle().fill(theme.line).frame(height: 1) }
    }

    /// Tarih seçildiyse en ucuz odanın toplamı; değilse kartla aynı "gecelik
    /// başlayan" fiyat; o da yoksa "talep üzerine".
    @ViewBuilder private var priceSummary: some View {
        if let quote = quoteState.quote, let cheapest = quote.cheapest, let total = cheapest.totalMinor {
            VStack(alignment: .leading, spacing: 0) {
                RollingAmount(minor: total, currency: cheapest.currency)
                    .font(theme.display(22, style: .title3))
                    .foregroundStyle(theme.isDark ? theme.text : theme.navy)
                    .minimumScaleFactor(0.8)
                    .lineLimit(1)
                Text("\(quote.nights) gece toplam, başlayan")
                    .font(theme.body(12))
                    .foregroundStyle(theme.textDim)
                    .lineLimit(1)
            }
            .accessibilityElement(children: .combine)
        } else if let price = hotel.price {
            VStack(alignment: .leading, spacing: 0) {
                Text(Formatting.price(price))
                    .font(theme.display(22, style: .title3))
                    .foregroundStyle(theme.isDark ? theme.text : theme.navy)
                    .minimumScaleFactor(0.8)
                    .lineLimit(1)
                Text(price.fromDate == nil ? String(localized: "gecelik başlayan") : Formatting.priceNote(price))
                    .font(theme.body(12))
                    .foregroundStyle(theme.textDim)
                    .lineLimit(1)
            }
            .accessibilityElement(children: .combine)
        } else {
            VStack(alignment: .leading, spacing: 0) {
                Text("Fiyat")
                    .font(theme.body(15, weight: 700))
                    .foregroundStyle(theme.isDark ? theme.text : theme.navy)
                Text("talep üzerine")
                    .font(theme.body(12))
                    .foregroundStyle(theme.textDim)
            }
            .accessibilityElement(children: .combine)
        }
    }

    // MARK: İçerik bölümleri

    private var prices: some View {
        SectionBlock(title: String(localized: "Fiyatlar")) {
            StayPriceSection(hotel: hotel, stay: store.stay, state: quoteState, onEdit: { showsStay = true }, onRetry: loadQuote)
        }
    }

    private func loadQuote() async {
        if store.stay.hasDates { quoteState = .loading }
        if let next = await api.quoteState(hotelSlug: hotel.slug, stay: store.stay) { quoteState = next }
    }

    @ViewBuilder private var description: some View {
        if let text = hotel.longDescription ?? hotel.shortDescription {
            SectionBlock(title: String(localized: "Otel hakkında")) {
                VStack(alignment: .leading, spacing: 10) {
                    Text(text)
                        .font(theme.body(16))
                        .foregroundStyle(theme.textMuted)
                        .lineSpacing(5)
                        .lineLimit(showsFullDescription ? nil : 6)
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
    }

    private var amenities: some View {
        SectionBlock(title: String(localized: "Olanaklar")) {
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
                ForEach(Array(hotel.amenities.prefix(12)), id: \.self) { amenity in
                    VStack(spacing: 10) {
                        Image(systemName: AmenityIcon.symbol(for: amenity))
                            .font(.title2)
                            .foregroundStyle(theme.primary)
                        Text(amenity)
                            .font(theme.body(14, weight: 600))
                            .foregroundStyle(theme.text)
                            .multilineTextAlignment(.center)
                            .lineLimit(2)
                    }
                    .frame(maxWidth: .infinity, minHeight: 96)
                    .padding(.horizontal, 8)
                    .background(theme.surface2, in: .rect(cornerRadius: theme.radiusMedium, style: .continuous))
                }
            }
            if hotel.amenities.count > 12 {
                Button("\(hotel.amenities.count) olanağın tümünü gör") { showsAmenities = true }
                    .buttonStyle(.otsOutline)
                    .accessibilityIdentifier("hotel.amenities.all")
            }
        }
    }

    private var rooms: some View {
        SectionBlock(title: String(localized: "\(hotel.rooms.count) oda tipi")) {
            ScrollView(.horizontal) {
                LazyHStack(spacing: 14) {
                    ForEach(hotel.rooms) { room in
                        NavigationLink(value: RoomRoute(hotel: hotel, room: room)) {
                            RoomCardView(room: room, quote: quoteState.quote?.rooms.first { $0.slug == room.slug }, nights: quoteState.quote?.nights)
                        }
                        .buttonStyle(.pressScale)
                        .accessibilityIdentifier("room-card-\(room.slug)")
                    }
                }
                .scrollTargetLayout()
            }
            .scrollTargetBehavior(.viewAligned)
            .scrollIndicators(.hidden)
            .contentMargins(.horizontal, 16, for: .scrollContent)
            .padding(.horizontal, -16)
        }
    }

    private var policies: some View {
        SectionBlock(title: String(localized: "Kurallar")) {
            VStack(alignment: .leading, spacing: 0) {
                let rows = policyRows
                ForEach(Array(rows.enumerated()), id: \.offset) { index, row in
                    HStack(alignment: .top, spacing: 12) {
                        Image(systemName: row.symbol)
                            .foregroundStyle(theme.primary)
                            .frame(width: 22)
                        Text(row.title)
                            .font(theme.body(15, weight: 600))
                            .foregroundStyle(theme.text)
                        Spacer(minLength: 12)
                        Text(row.value)
                            .font(theme.body(15))
                            .foregroundStyle(theme.textMuted)
                            .multilineTextAlignment(.trailing)
                    }
                    .padding(.vertical, 14)
                    .padding(.horizontal, 16)
                    if index < rows.count - 1 { Divider().overlay(theme.line) }
                }
            }
            .cardSurface()
        }
    }

    private var policyRows: [(title: String, value: String, symbol: String)] {
        var rows: [(String, String, String)] = []
        if let value = hotel.policies.checkInTime { rows.append((String(localized: "Giriş"), value, "arrow.down.to.line")) }
        if let value = hotel.policies.checkOutTime { rows.append((String(localized: "Çıkış"), value, "arrow.up.to.line")) }
        if let value = hotel.policies.childPolicy { rows.append((String(localized: "Çocuk"), value, "figure.and.child.holdinghands")) }
        if let pets = hotel.policies.petsAllowed { rows.append((String(localized: "Evcil hayvan"), pets ? String(localized: "Kabul edilir") : String(localized: "Kabul edilmez"), "pawprint")) }
        if let value = hotel.policies.cancellationPolicy { rows.append((String(localized: "İptal"), value, "calendar.badge.minus")) }
        return rows.map { (title: $0.0, value: $0.1, symbol: $0.2) }
    }

    private func map(_ location: HotelDetail.Location) -> some View {
        let coordinate = CLLocationCoordinate2D(latitude: location.latitude, longitude: location.longitude)
        return SectionBlock(title: String(localized: "Konum")) {
            // Etkileşim kapalı: harita sayfa kaydırmasını yakalamasın. Gezinmek için Haritalar açılır.
            Map(initialPosition: .region(MKCoordinateRegion(center: coordinate, latitudinalMeters: 2500, longitudinalMeters: 2500)), interactionModes: []) {
                Marker(hotel.name, coordinate: coordinate).tint(theme.cta)
            }
            .frame(height: 220)
            .clipShape(.rect(cornerRadius: theme.radiusMedium, style: .continuous))
            .accessibilityLabel("\(hotel.name) haritada")
            if let address = location.address {
                Text(address).font(theme.body(14)).foregroundStyle(theme.textDim)
            }
            Button("Yol tarifi al", systemImage: "arrow.triangle.turn.up.right.diamond") {
                let item = MKMapItem(placemark: MKPlacemark(coordinate: coordinate))
                item.name = hotel.name
                item.openInMaps(launchOptions: [MKLaunchOptionsDirectionsModeKey: MKLaunchOptionsDirectionsModeDriving])
            }
            .buttonStyle(.otsOutline)
            .accessibilityIdentifier("hotel.directions")
        }
    }

    private func inquiryForm(source: InquiryDraft.Source, message: String) -> InquiryView {
        InquiryView(hotelSlug: hotel.slug, hotelName: hotel.name, hotelImageUrl: hotel.imageUrl, rooms: hotel.rooms, source: source, initialMessage: message, stay: store.stay)
    }

    private func openGuide() {
        let model = guide ?? GuideModel(hotelSlug: hotel.slug, hotelName: hotel.name, api: api)
        guide = model
        presentedGuide = model
    }
}

/// Otelin tüm olanakları (sayfada ilk 12'si görünür).
private struct AmenityListSheet: View {
    @Environment(\.theme) private var theme
    @Environment(\.dismiss) private var dismiss
    let amenities: [String]

    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 0) {
                    ForEach(Array(amenities.enumerated()), id: \.offset) { index, amenity in
                        Label {
                            Text(amenity)
                                .font(theme.body(16))
                                .foregroundStyle(theme.text)
                        } icon: {
                            Image(systemName: AmenityIcon.symbol(for: amenity))
                                .foregroundStyle(theme.primary)
                                .frame(width: 28)
                        }
                        .padding(.vertical, 13)
                        if index < amenities.count - 1 { Divider().overlay(theme.line) }
                    }
                }
                .padding(.horizontal, 20)
            }
            .background(theme.bg)
            .navigationTitle("\(amenities.count) olanak")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Kapat") { dismiss() } }
            }
        }
        .presentationDetents([.medium, .large])
    }
}

/// Bölüm başlığı (serif/sans) ve içeriği.
private struct SectionBlock<Content: View>: View {
    @Environment(\.theme) private var theme
    let title: String
    @ViewBuilder let content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text(title)
                .font(theme.display(26, style: .title2))
                .foregroundStyle(theme.isDark ? theme.text : theme.navy)
                .accessibilityAddTraits(.isHeader)
            content
        }
        .padding(.horizontal, 16)
    }
}

private struct RoomCardView: View {
    @Environment(\.theme) private var theme
    let room: Room
    /// Seçilen tarihlerin fiyatı (varsa).
    var quote: RoomQuote?
    var nights: Int?

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Color.clear
                .frame(width: 260, height: 160)
                .overlay { RemoteImage(path: room.imageUrl ?? room.galleryUrls.first) }
                .clipped()
            VStack(alignment: .leading, spacing: 8) {
                Text(room.name)
                    .font(theme.display(19, style: .headline))
                    .foregroundStyle(theme.isDark ? theme.text : theme.navy)
                    .lineLimit(2, reservesSpace: true)
                HStack(spacing: 12) {
                    Label(room.capacityText, systemImage: "person.2")
                    if let size = room.sizeSqm { Label("\(size) m²", systemImage: "square.dashed") }
                }
                .font(theme.body(13))
                .foregroundStyle(theme.textDim)
                Text(room.boardLabel)
                    .font(theme.body(13, weight: 600))
                    .foregroundStyle(theme.primary)
                if let quote, let nights {
                    RoomQuotePrice(quote: quote, nights: nights, compact: true)
                        .padding(.top, 2)
                }
                Label("Odayı incele", systemImage: "arrow.right")
                    .labelStyle(TrailingIconLabelStyle())
                    .font(theme.body(14, weight: 700))
                    .foregroundStyle(theme.isDark ? theme.sand : theme.primary)
                    .padding(.top, 2)
            }
            .padding(14)
        }
        .frame(width: 260, alignment: .leading)
        .frame(maxHeight: .infinity, alignment: .top)
        .cardSurface()
    }
}

/// "Odayı incele →": metin önce, simge sonra.
struct TrailingIconLabelStyle: LabelStyle {
    func makeBody(configuration: Configuration) -> some View {
        HStack(spacing: 6) {
            configuration.title
            configuration.icon
        }
    }
}

#Preview {
    NavigationStack { HotelDetailView(slug: "orucoglu-thermal-hotel", title: "Oruçoğlu") }
        .environment(\.theme, .termal)
        .environment(StayStore())
        .modelContainer(for: [SavedHotel.self, RecentHotel.self, SentInquiry.self], inMemory: true)
}
