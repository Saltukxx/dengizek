import SwiftData
import SwiftUI

struct SavedView: View {
    @Environment(\.modelContext) private var context
    @Environment(\.theme) private var theme
    @Environment(\.api) private var api
    @State private var alerts = PriceAlerts.shared
    @Query(sort: \SavedHotel.savedAt, order: .reverse) private var saved: [SavedHotel]
    @Query(sort: \RecentHotel.viewedAt, order: .reverse) private var recent: [RecentHotel]
    @Query(sort: \SentInquiry.sentAt, order: .reverse) private var inquiries: [SentInquiry]

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 12) {
                if saved.isEmpty && recent.isEmpty && inquiries.isEmpty {
                    StateMessageView(
                        symbol: "heart",
                        title: String(localized: "Henüz kayıt yok"),
                        message: String(localized: "Beğendiğiniz otelde kalp simgesine dokunun; burada toplanır. Gönderdiğiniz talepler ve baktığınız oteller de burada listelenir.")
                    )
                    .padding(.top, 40)
                }
                if !inquiries.isEmpty {
                    SavedSectionTitle(String(localized: "Talepleriniz"), count: inquiries.count)
                    ForEach(inquiries) { inquiry in
                        NavigationLink(value: InquiryRoute(id: inquiry.id)) { InquiryRow(inquiry: inquiry) }
                            .buttonStyle(.pressScaleRow)
                            .disabled(inquiry.portalToken == nil)
                            .accessibilityIdentifier("inquiry-\(inquiry.hotelSlug)")
                            .contextMenu {
                                Button("Listeden kaldır", systemImage: "trash", role: .destructive) {
                                    context.delete(inquiry)
                                    try? context.save()
                                }
                            }
                    }
                }
                if !saved.isEmpty {
                    SavedSectionTitle(String(localized: "Kaydettikleriniz"), count: saved.count)
                        .padding(.top, inquiries.isEmpty ? 0 : 20)
                    priceAlertToggle
                    ForEach(saved) { hotel in
                        let summary = HotelSummary(slug: hotel.slug, name: hotel.name, city: hotel.city, imageUrl: hotel.imageUrl)
                        NavigationLink(value: summary) { HotelRow(summary: summary) }
                            .buttonStyle(.pressScaleRow)
                            .contextMenu {
                                Button("Kayıttan çıkar", systemImage: "heart.slash", role: .destructive) {
                                    let slug = hotel.slug
                                    context.delete(hotel)
                                    try? context.save()
                                    HotelLibrary.publish(in: context)
                                    Task { await alerts.hotelChanged(slug: slug, saved: false, api: api) }
                                }
                            }
                    }
                }
                if !recent.isEmpty {
                    SavedSectionTitle(String(localized: "Son baktıklarınız")).padding(.top, saved.isEmpty && inquiries.isEmpty ? 0 : 20)
                    ForEach(recent.prefix(10)) { hotel in
                        let summary = HotelSummary(slug: hotel.slug, name: hotel.name, city: hotel.city, imageUrl: hotel.imageUrl)
                        NavigationLink(value: summary) { HotelRow(summary: summary) }
                            .buttonStyle(.pressScaleRow)
                    }
                }
            }
            .padding(16)
            .readableWidth()
        }
        .background(theme.bg)
        .brandedNavigationTitle(String(localized: "Kaydedilenler"))
        .navigationDestination(for: HotelSummary.self) { hotel in
            HotelDetailView(slug: hotel.slug, title: hotel.name)
        }
        .navigationDestination(for: InquiryRoute.self) { route in
            InquiryThreadView(inquiryId: route.id)
        }
    }

    /// Kaydedilen otellerde fiyat düşünce bildirim. İzin, misafir anahtarı açınca istenir.
    private var priceAlertToggle: some View {
        VStack(alignment: .leading, spacing: 6) {
            Toggle(isOn: Binding(
                get: { alerts.isOn },
                set: { on in
                    let slugs = saved.map(\.slug)
                    Task { if on { await alerts.enable(slugs: slugs, api: api) } else { await alerts.disable(slugs: slugs, api: api) } }
                }
            )) {
                Label("Fiyat düşünce haber ver", systemImage: "bell.badge")
                    .font(theme.body(15, weight: 600))
                    .foregroundStyle(theme.text)
            }
            .tint(theme.primary)
            .disabled(alerts.status == .working)
            .accessibilityIdentifier("saved.priceAlerts")
            if let note = priceAlertNote {
                Text(note)
                    .font(theme.body(13))
                    .foregroundStyle(theme.textDim)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .cardSurface()
        .sensoryFeedback(.success, trigger: alerts.status) { _, new in new == .on }
    }

    private var priceAlertNote: String? {
        switch alerts.status {
        case .off, .working: String(localized: "Kaydettiğiniz otellerin gecelik başlayan fiyatı düşünce bildirim alırsınız.")
        case .on: nil
        case .denied: String(localized: "Bildirim izni kapalı. Ayarlar > Otelsayfam > Bildirimler'den açabilirsiniz.")
        case .unavailable: String(localized: "Bildirim şu an açılamadı. Bağlantınızı kontrol edip tekrar deneyin.")
        }
    }
}

/// Gönderilen talep: otel, tarih, ne zaman gönderildiği ve cevap durumu.
private struct InquiryRow: View {
    @Environment(\.theme) private var theme
    let inquiry: SentInquiry

    var body: some View {
        HStack(spacing: 14) {
            RemoteImage(path: inquiry.imageUrl)
                .frame(width: 76, height: 76)
                .clipShape(.rect(cornerRadius: theme.radius, style: .continuous))
            VStack(alignment: .leading, spacing: 4) {
                Text(inquiry.hotelName)
                    .font(theme.display(18, style: .headline))
                    .foregroundStyle(theme.isDark ? theme.text : theme.navy)
                    .lineLimit(2)
                Text(inquiry.datesSummary ?? String(localized: "Tarih belirtilmedi"))
                    .font(theme.body(14))
                    .foregroundStyle(theme.textDim)
                status
            }
            Spacer(minLength: 0)
            if inquiry.portalToken != nil {
                Image(systemName: "chevron.right").font(.footnote.weight(.semibold)).foregroundStyle(theme.textDim)
            }
        }
        .padding(12)
        .cardSurface()
        .accessibilityElement(children: .combine)
        .accessibilityHint(inquiry.portalToken == nil ? "" : String(localized: "Yazışmayı açar"))
    }

    @ViewBuilder private var status: some View {
        if inquiry.hasUnreadReply {
            Label("Yeni cevap", systemImage: "envelope.badge.fill")
                .font(theme.body(13, weight: 700))
                .foregroundStyle(theme.cta)
        } else if inquiry.portalToken == nil {
            Text("Cevap e-postanıza gelecek")
                .font(theme.body(13, weight: 600))
                .foregroundStyle(theme.textMuted)
        } else {
            Text("\(inquiry.sentAt.formatted(.relative(presentation: .named))) gönderildi")
                .font(theme.body(13, weight: 600))
                .foregroundStyle(theme.textMuted)
                .lineLimit(1)
        }
    }
}

private struct SavedSectionTitle: View {
    @Environment(\.theme) private var theme
    let title: String
    var count: Int?

    init(_ title: String, count: Int? = nil) {
        self.title = title
        self.count = count
    }

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Text(title)
                .font(theme.display(22, style: .title3))
                .foregroundStyle(theme.isDark ? theme.text : theme.navy)
            if let count {
                Text("\(count)")
                    .font(theme.body(14, weight: 600).monospacedDigit())
                    .foregroundStyle(theme.textDim)
            }
        }
        .accessibilityAddTraits(.isHeader)
    }
}

#Preview {
    NavigationStack { SavedView() }
        .modelContainer(for: [SavedHotel.self, RecentHotel.self, SentInquiry.self], inMemory: true)
}
