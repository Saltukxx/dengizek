import SwiftUI

/// Uygulama genelinde seçili konaklama ve liste filtreleri. Keşfet'te seçilen
/// tarih ve kişi otel sayfasına, oda sayfasına ve talep formuna taşınır
/// (web'de aynı bilgi URL parametreleriyle taşınır).
@MainActor
@Observable
final class StayStore {
    var stay: StaySearch {
        didSet {
            if stay != oldValue, let defaults { stay.save(to: defaults) }
        }
    }
    var filters = BrowseFilters()
    @ObservationIgnored private let defaults: UserDefaults?

    /// `defaults` verilirse seçim oradan okunur ve değiştikçe yazılır;
    /// önizleme ve testler kalıcı olmayan boş bir seçimle başlar.
    init(defaults: UserDefaults? = nil) {
        self.defaults = defaults
        stay = defaults.map { StaySearch.restored(from: $0) } ?? StaySearch()
    }
}

/// Tarih ve kişi seçimi; `filters` verilirse liste filtreleri de gösterilir.
/// Değişiklik "Uygula" ile işlenir, vazgeçilirse eski seçim kalır.
struct StaySheet: View {
    @Environment(\.theme) private var theme
    @Environment(\.dismiss) private var dismiss
    let title: String
    let confirmTitle: String
    @Binding var stay: StaySearch
    var filters: Binding<BrowseFilters>?

    @State private var draftStay = StaySearch()
    @State private var draftFilters = BrowseFilters()
    @State private var hasDates = false
    @State private var checkIn = Date.now
    @State private var checkOut = Date.now

    /// Web'deki gibi yeni eklenen çocuğun yaşı; misafir değiştirebilir.
    private static let defaultChildAge = 6

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Toggle("Tarihlerim belli", isOn: $hasDates.animation())
                    if hasDates {
                        DatePicker("Giriş", selection: $checkIn, in: Calendar.current.startOfDay(for: .now)..., displayedComponents: .date)
                        DatePicker("Çıkış", selection: $checkOut, in: minCheckOut..., displayedComponents: .date)
                    }
                } header: {
                    Text("Tarih")
                } footer: {
                    if let warning = dateWarning {
                        Text(warning).foregroundStyle(theme.cta)
                    } else if hasDates, let nights {
                        Text("\(nights) gece")
                    }
                }

                Section {
                    Stepper("Yetişkin: \(draftStay.adults)", value: $draftStay.adults, in: 1...StaySearch.maxAdults)
                    Stepper("Çocuk: \(draftStay.childAges.count)", value: childCount, in: 0...StaySearch.maxChildren)
                    ForEach(draftStay.childAges.indices, id: \.self) { index in
                        Picker("\(index + 1). çocuğun yaşı", selection: $draftStay.childAges[index]) {
                            ForEach(0...StaySearch.maxChildAge, id: \.self) { age in
                                Text(age == 0 ? String(localized: "1 yaşından küçük") : String(localized: "\(age) yaş")).tag(age)
                            }
                        }
                    }
                } header: {
                    Text("Kişi")
                } footer: {
                    if !draftStay.childAges.isEmpty { Text("Çocuk ücreti yaşa göre hesaplanır.") }
                }

                if filters != nil {
                    Section("Filtreler") {
                        Toggle("Video turu olanlar", isOn: $draftFilters.tourOnly)
                        Toggle("Kampanyalı", isOn: $draftFilters.promoOnly)
                        Toggle("Evcil hayvan kabul eden", isOn: $draftFilters.petsOnly)
                        Picker("Gecelik fiyat", selection: $draftFilters.priceBand) {
                            Text("Tümü").tag(BrowseFilters.PriceBand?.none)
                            ForEach(BrowseFilters.PriceBand.allCases) { band in
                                Text(band.title).tag(Optional(band))
                            }
                        }
                    }
                    Section {
                        Picker("Sıralama", selection: $draftFilters.sort) {
                            ForEach(BrowseFilters.Sort.allCases) { sort in Text(sort.title).tag(sort) }
                        }
                    }
                }

                Section {
                    Button(confirmTitle, action: apply)
                        .buttonStyle(.otsCTA)
                        .disabled(dateWarning != nil)
                        .listRowBackground(Color.clear)
                        .listRowInsets(EdgeInsets())
                        .accessibilityIdentifier("stay.apply")
                }
            }
            .scrollContentBackground(.hidden)
            .background(theme.bg)
            .tint(theme.primary)
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Vazgeç") { dismiss() }
                }
                ToolbarItem(placement: .destructiveAction) {
                    Button("Temizle", action: clear).disabled(isCleared)
                }
            }
            .onChange(of: checkIn) { _, newValue in
                if checkOut <= newValue { checkOut = Calendar.current.date(byAdding: .day, value: 1, to: newValue)! }
            }
        }
        .onAppear(perform: loadDraft)
    }

    private var minCheckOut: Date { Calendar.current.date(byAdding: .day, value: 1, to: checkIn)! }

    private var nights: Int? { Calendar.current.dateComponents([.day], from: checkIn, to: checkOut).day }

    /// Sunucu 30 geceden uzun konaklamayı fiyatlamaz; önceden söylenir.
    private var dateWarning: String? {
        guard hasDates, let nights else { return nil }
        if nights > StaySearch.maxNights {
            return String(localized: "\(StaySearch.maxNights) geceden uzun konaklamalar için fiyatı ekibimiz bildirir; talep gönderin.")
        }
        return nil
    }

    private var isCleared: Bool {
        !hasDates && draftStay.adults == 2 && draftStay.childAges.isEmpty && (filters == nil || draftFilters == BrowseFilters())
    }

    private var childCount: Binding<Int> {
        Binding {
            draftStay.childAges.count
        } set: { count in
            if count > draftStay.childAges.count {
                draftStay.childAges.append(Self.defaultChildAge)
            } else {
                draftStay.childAges.removeLast(draftStay.childAges.count - count)
            }
        }
    }

    private func loadDraft() {
        draftStay = stay
        draftFilters = filters?.wrappedValue ?? BrowseFilters()
        hasDates = stay.hasDates
        let suggested = StaySearch.suggestedDates()
        checkIn = stay.checkIn ?? suggested.0
        checkOut = stay.checkOut ?? suggested.1
    }

    private func clear() {
        withAnimation {
            hasDates = false
            draftStay = StaySearch()
            draftFilters = BrowseFilters()
        }
    }

    private func apply() {
        var next = draftStay
        next.checkIn = hasDates ? Calendar.current.startOfDay(for: checkIn) : nil
        next.checkOut = hasDates ? Calendar.current.startOfDay(for: checkOut) : nil
        stay = next
        filters?.wrappedValue = draftFilters
        dismiss()
    }
}

/// Seçili tarih ve kişiyi gösteren dokunulabilir satır (Keşfet ve otel sayfası).
struct StaySummaryButton: View {
    @Environment(\.theme) private var theme
    let stay: StaySearch
    var filterCount = 0
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 12) {
                Image(systemName: "calendar")
                    .font(.system(size: 18, weight: .medium))
                    .foregroundStyle(theme.primary)
                    .frame(width: 24)
                VStack(alignment: .leading, spacing: 2) {
                    Text(stay.datesSummary ?? String(localized: "Tarih seçin"))
                        .contentTransition(.numericText())
                        .font(theme.body(15, weight: 700))
                        .foregroundStyle(stay.hasDates ? theme.text : theme.textMuted)
                    Text(stay.partySummary)
                        .contentTransition(.numericText())
                        .font(theme.body(13))
                        .foregroundStyle(theme.textDim)
                }
                Spacer(minLength: 8)
                if filterCount > 0 {
                    Text("\(filterCount) filtre")
                        .font(theme.body(12, weight: 700))
                        .foregroundStyle(theme.onPrimary)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(theme.primary, in: .capsule)
                }
                Image(systemName: "chevron.right")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(theme.textDim)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .animation(.spring(response: 0.4, dampingFraction: 0.65), value: stay)
            .contentShape(.rect)
        }
        .buttonStyle(.pressScaleRow)
        .cardSurface()
        .accessibilityElement(children: .combine)
        .accessibilityHint("Tarih, kişi ve filtreleri değiştirir.")
        .accessibilityIdentifier("stay.summary")
    }
}

#Preview {
    @Previewable @State var stay = StaySearch()
    @Previewable @State var filters = BrowseFilters()
    StaySheet(title: "Ara ve süz", confirmTitle: "Otelleri göster", stay: $stay, filters: $filters)
        .environment(\.theme, .termal)
}
