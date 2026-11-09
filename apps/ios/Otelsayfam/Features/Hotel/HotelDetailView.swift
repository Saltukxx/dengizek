import MapKit
import SwiftData
import SwiftUI

struct HotelDetailView: View {
    @Environment(\.api) private var api
    @Environment(\.theme) private var theme
    let slug: String
    let title: String
    @State private var state: Loadable<HotelDetail> = .loading

    var body: some View {
        Group {
            switch state {
            case .loading:
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            case .failed(let message):
                ErrorStateView(message: message) { await load() }
            case .loaded(let hotel):
                HotelDetailContent(hotel: hotel)
            }
        }
        .background(theme.bg)
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.inline)
        // Gezinme çubuğu açık zeminde: durum çubuğu ve başlık her temada okunur.
        .toolbarBackground(theme.headerBackground, for: .navigationBar)
        .toolbarBackground(.visible, for: .navigationBar)
        .toolbarColorScheme(theme.isDark ? .dark : .light, for: .navigationBar)
        .toolbar {
            // Başlık rengi sabit: iOS altındaki koyu banner'a bakıp beyaza çevirebiliyor.
            ToolbarItem(placement: .principal) {
                Text(title)
                    .font(theme.body(16, weight: 700, style: .headline))
                    .foregroundStyle(theme.text)
                    .lineLimit(1)
            }
        }
        .task { await load() }
    }

    private func load() async {
        do {
            state = .loaded(try await api.hotel(slug: slug))
        } catch is CancellationError {
        } catch {
            state = .failed(error.localizedDescription)
        }
    }
}

private struct HotelDetailContent: View {
    @Environment(\.api) private var api
    @Environment(\.theme) private var theme
    @Environment(\.modelContext) private var context
    let hotel: HotelDetail
    @State private var showsFullDescription = false
    @State private var playingTour: HotelDetail.Tour?
    /// Sohbet sayfa açık kaldıkça korunur (sheet kapanıp açılınca kaybolmaz).
    @State private var guide: GuideModel?
    /// Gösterilen sohbet. `sheet(item:)` ile: `isPresented` + ayrı opsiyonel
    /// durumda sheet ilk açılışta modeli nil görüp boş açılıyordu.
    @State private var presentedGuide: GuideModel?
    @State private var showsInquiry = false
    @State private var galleryIndex = 0

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                banner
                gallery
                    .padding(.horizontal, 16)
                    .padding(.top, -64)
                VStack(alignment: .leading, spacing: 32) {
                    actions
                    description
                    if !hotel.amenities.isEmpty { amenities }
                    if !hotel.rooms.isEmpty { rooms }
                    policies
                    if let location = hotel.location { map(location) }
                }
                .padding(.top, 24)
                .padding(.bottom, 40)
            }
        }
        .background(theme.bg)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) { SaveButton(hotel: hotel.summary, style: .toolbar) }
        }
        .onAppear { HotelLibrary.recordView(hotel.summary, in: context) }
        .fullScreenCover(item: $playingTour) { tour in
            TourScreen(hotelSlug: hotel.slug, tourId: tour.tourId)
                .environment(\.theme, theme)
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
            HStack(spacing: 12) {
                if let address = hotel.location?.address ?? hotel.city {
                    Label(address, systemImage: "mappin.and.ellipse")
                        .font(theme.body(15))
                        .foregroundStyle(theme.mutedOnDeep)
                        .lineLimit(1)
                }
                if let stars = hotel.starRating, stars > 0 {
                    Text(String(repeating: "★", count: stars))
                        .foregroundStyle(theme.sand)
                        .accessibilityLabel("\(stars) yıldız")
                }
            }
        }
        .padding(.horizontal, 20)
        .padding(.top, 24)
        .padding(.bottom, 88)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(DeepBackground())
    }

    // MARK: Galeri (banner'ın üstüne taşan, sayaçlı)

    private var gallery: some View {
        let images = hotel.gallery.isEmpty ? [HotelDetail.GalleryImage(url: hotel.imageUrl ?? "", caption: nil)] : hotel.gallery
        return TabView(selection: $galleryIndex) {
            ForEach(Array(images.enumerated()), id: \.offset) { index, image in
                Color.clear
                    .overlay { RemoteImage(path: image.url) }
                    .clipped()
                    .tag(index)
            }
        }
        .tabViewStyle(.page(indexDisplayMode: .never))
        .aspectRatio(4 / 3, contentMode: .fit)
        .clipShape(.rect(cornerRadius: theme.radiusLarge, style: .continuous))
        .overlay(alignment: .bottomTrailing) {
            Text("\(galleryIndex + 1) / \(images.count)")
                .font(theme.body(14, weight: 600).monospacedDigit())
                .foregroundStyle(.white)
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
                .background(.black.opacity(0.55), in: .capsule)
                .padding(12)
        }
        .shadow(color: theme.shadow, radius: 16, y: 8)
    }

    // MARK: Eylemler

    private var actions: some View {
        VStack(spacing: 10) {
            if let tour = hotel.tours.first {
                Button { playingTour = tour } label: {
                    Label("Oteli video turla gez", systemImage: "play.fill")
                }
                .buttonStyle(.otsPrimary)
                .accessibilityIdentifier("hotel.tour")
            }
            Button(action: openGuide) {
                HStack(spacing: 10) {
                    GuideAvatar(size: 24)
                    Text("Yapay zekâ rehberine sor")
                }
            }
            .buttonStyle(.otsOutline)
            .accessibilityIdentifier("hotel.guide")
            Button { showsInquiry = true } label: {
                Label("Talep gönder", systemImage: "paperplane.fill")
            }
            .buttonStyle(.otsCTA)
            .accessibilityIdentifier("hotel.inquiry")
            Text("Ekibimiz talebinize e-postayla dönüş yapar.")
                .font(theme.body(13))
                .foregroundStyle(theme.textDim)
                .frame(maxWidth: .infinity)
        }
        .padding(.horizontal, 16)
    }

    // MARK: İçerik bölümleri

    @ViewBuilder private var description: some View {
        if let text = hotel.longDescription ?? hotel.shortDescription {
            SectionBlock(eyebrow: "Otel hakkında", title: "Genel bakış") {
                VStack(alignment: .leading, spacing: 10) {
                    Text(text)
                        .font(theme.body(16))
                        .foregroundStyle(theme.textMuted)
                        .lineSpacing(5)
                        .lineLimit(showsFullDescription ? nil : 6)
                    Button(showsFullDescription ? "Daha az göster" : "Devamını oku") {
                        withAnimation { showsFullDescription.toggle() }
                    }
                    .font(theme.body(15, weight: 600))
                    .foregroundStyle(theme.primary)
                }
            }
        }
    }

    private var amenities: some View {
        SectionBlock(eyebrow: "Olanaklar", title: "Neler var?") {
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
                Text("ve \(hotel.amenities.count - 12) olanak daha")
                    .font(theme.body(14))
                    .foregroundStyle(theme.textDim)
            }
        }
    }

    private var rooms: some View {
        SectionBlock(eyebrow: "Odalar", title: "\(hotel.rooms.count) oda tipi") {
            ScrollView(.horizontal) {
                LazyHStack(spacing: 14) {
                    ForEach(hotel.rooms) { room in
                        RoomCardView(room: room)
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
        SectionBlock(eyebrow: "Bilmeniz gerekenler", title: "Kurallar") {
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
        if let value = hotel.policies.checkInTime { rows.append(("Giriş", value, "arrow.down.to.line")) }
        if let value = hotel.policies.checkOutTime { rows.append(("Çıkış", value, "arrow.up.to.line")) }
        if let value = hotel.policies.childPolicy { rows.append(("Çocuk", value, "figure.and.child.holdinghands")) }
        if let pets = hotel.policies.petsAllowed { rows.append(("Evcil hayvan", pets ? "Kabul edilir" : "Kabul edilmez", "pawprint")) }
        if let value = hotel.policies.cancellationPolicy { rows.append(("İptal", value, "calendar.badge.minus")) }
        return rows.map { (title: $0.0, value: $0.1, symbol: $0.2) }
    }

    private func map(_ location: HotelDetail.Location) -> some View {
        let coordinate = CLLocationCoordinate2D(latitude: location.latitude, longitude: location.longitude)
        return SectionBlock(eyebrow: "Konum", title: "Nerede?") {
            Map(initialPosition: .region(MKCoordinateRegion(center: coordinate, latitudinalMeters: 2500, longitudinalMeters: 2500))) {
                Marker(hotel.name, coordinate: coordinate).tint(theme.cta)
            }
            .frame(height: 220)
            .clipShape(.rect(cornerRadius: theme.radiusMedium, style: .continuous))
            if let address = location.address {
                Text(address).font(theme.body(14)).foregroundStyle(theme.textDim)
            }
        }
    }

    private func inquiryForm(source: InquiryDraft.Source, message: String) -> InquiryView {
        InquiryView(hotelSlug: hotel.slug, hotelName: hotel.name, rooms: hotel.rooms, source: source, initialMessage: message)
    }

    private func openGuide() {
        let model = guide ?? GuideModel(hotelSlug: hotel.slug, hotelName: hotel.name, api: api)
        guide = model
        presentedGuide = model
    }
}

/// Web bölüm başlığı: renkli üst başlık + serif/sans büyük başlık.
private struct SectionBlock<Content: View>: View {
    @Environment(\.theme) private var theme
    let eyebrow: String
    let title: String
    @ViewBuilder let content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            VStack(alignment: .leading, spacing: 6) {
                Eyebrow(eyebrow)
                Text(title)
                    .font(theme.display(26, style: .title2))
                    .foregroundStyle(theme.isDark ? theme.text : theme.navy)
            }
            content
        }
        .padding(.horizontal, 16)
    }
}

private struct RoomCardView: View {
    @Environment(\.theme) private var theme
    let room: Room

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
                    Label(capacity, systemImage: "person.2")
                    if let size = room.sizeSqm { Label("\(size) m²", systemImage: "square.dashed") }
                }
                .font(theme.body(13))
                .foregroundStyle(theme.textDim)
                Text(boardLabel)
                    .font(theme.body(13, weight: 600))
                    .foregroundStyle(theme.primary)
            }
            .padding(14)
        }
        .frame(width: 260, alignment: .leading)
        .cardSurface()
    }

    private var capacity: String {
        room.capacityChildren > 0
            ? "\(room.capacityAdults) yetişkin + \(room.capacityChildren) çocuk"
            : "\(room.capacityAdults) yetişkin"
    }

    private var boardLabel: String {
        switch room.boardType {
        case "kahvalti-dahil": "Kahvaltı dahil"
        case "yarim-pansiyon": "Yarım pansiyon"
        case "tam-pansiyon": "Tam pansiyon"
        case "hersey-dahil": "Her şey dahil"
        default: "Sadece oda"
        }
    }
}

#Preview {
    NavigationStack { HotelDetailView(slug: "orucoglu-thermal-hotel", title: "Oruçoğlu") }
        .environment(\.theme, .termal)
        .modelContainer(for: [SavedHotel.self, RecentHotel.self], inMemory: true)
}
