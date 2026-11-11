import SwiftData
import SwiftUI

struct InquiryView: View {
    @Environment(\.api) private var api
    @Environment(\.modelContext) private var context
    @Environment(\.theme) private var theme
    @Environment(\.dismiss) private var dismiss
    let hotelSlug: String
    let hotelName: String
    /// "Talepleriniz" listesindeki küçük görsel.
    var hotelImageUrl: String?
    let rooms: [Room]
    var source: InquiryDraft.Source = .hotelPage
    var tourId: String?
    var initialMessage = ""
    /// Keşfet ya da otel sayfasında seçilen tarih ve kişi formu doldurur.
    var stay: StaySearch?
    var roomSlug: String?

    @State private var draft = InquiryDraft()
    @State private var didPrefill = false
    @State private var isSending = false
    @State private var errorMessage: String?
    @State private var sentInquiryId: String?
    @State private var pushState: PushOptIn = .idle

    private var sent: Bool { sentInquiryId != nil }

    enum PushOptIn: Equatable { case idle, working, enabled, denied, failed(String) }

    var body: some View {
        NavigationStack {
            Group {
                if sent { success } else { form }
            }
            .scrollContentBackground(.hidden)
            .background(theme.bg)
            .tint(theme.primary)
            .navigationTitle(sent ? "" : String(localized: "Talep gönder"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(sent ? String(localized: "Kapat") : String(localized: "Vazgeç")) { dismiss() }
                }
            }
        }
        .onAppear(perform: prefill)
        .sensoryFeedback(.success, trigger: sent) { _, isSent in isSent }
        // Eksik alan ya da gönderilemedi: hata titreşimi, mesaj formda görünür.
        .sensoryFeedback(.error, trigger: errorMessage) { _, message in message != nil }
        .interactiveDismissDisabled(isSending)
    }

    private func prefill() {
        guard !didPrefill else { return }
        didPrefill = true
        draft.message = initialMessage
        draft.roomSlug = roomSlug
        draft.apply(GuestProfile.load())
        if let stay {
            draft.adults = stay.adults
            draft.children = stay.childAges.count
            if stay.hasDates, let checkIn = stay.checkIn, let checkOut = stay.checkOut {
                draft.hasDates = true
                draft.checkIn = checkIn
                draft.checkOut = checkOut
            }
        }
    }

    private var form: some View {
        Form {
            Section {
                VStack(alignment: .leading, spacing: 8) {
                    Text(hotelName)
                        .font(theme.display(24, style: .title2))
                        .foregroundStyle(theme.isDark ? theme.text : theme.navy)
                    Text("Talebiniz Otelsayfam ekibine ulaşır; size e-postayla dönüş yaparız. Müsaitlik ve fiyat bilgilendiricidir, kesin onay rezervasyonda verilir.")
                        .font(theme.body(14))
                        .foregroundStyle(theme.textDim)
                }
                .listRowBackground(Color.clear)
                .listRowInsets(EdgeInsets(top: 8, leading: 4, bottom: 8, trailing: 4))
            }

            Section("Konaklama") {
                Toggle("Tarihlerim belli", isOn: $draft.hasDates.animation())
                if draft.hasDates {
                    DatePicker("Giriş", selection: $draft.checkIn, in: Date.now..., displayedComponents: .date)
                    DatePicker("Çıkış", selection: $draft.checkOut, in: draft.checkIn.addingTimeInterval(86_400)..., displayedComponents: .date)
                }
                Stepper("Yetişkin: \(draft.adults)", value: $draft.adults, in: 1...20)
                Stepper("Çocuk: \(draft.children)", value: $draft.children, in: 0...20)
                if !rooms.isEmpty {
                    Picker("Oda", selection: $draft.roomSlug) {
                        Text("Fark etmez").tag(String?.none)
                        ForEach(rooms) { room in Text(room.name).tag(Optional(room.slug)) }
                    }
                }
            }

            Section("İletişim") {
                TextField("Ad Soyad", text: $draft.name)
                    .textContentType(.name)
                    .accessibilityIdentifier("inquiry.name")
                TextField("E-posta", text: $draft.email)
                    .textContentType(.emailAddress)
                    .keyboardType(.emailAddress)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .accessibilityIdentifier("inquiry.email")
            }

            Section("Mesaj") {
                TextField("Özel talepler, sorular…", text: $draft.message, axis: .vertical)
                    .lineLimit(4...10)
                    .accessibilityIdentifier("inquiry.message")
            }

            Section {
                Toggle("Bu talep ve (isteğe bağlı) gelecek teklifler için benimle iletişime geçilmesini kabul ediyorum", isOn: $draft.marketingConsent)
                    .font(.footnote)
            }

            Section {
                if let errorMessage {
                    Label(errorMessage, systemImage: "exclamationmark.triangle.fill")
                        .foregroundStyle(.red)
                        .font(.footnote)
                }
                Button(action: send) {
                    if isSending { ProgressView().tint(.white) } else { Label("Talebi gönder", systemImage: "paperplane.fill") }
                }
                .buttonStyle(.otsCTA)
                .disabled(isSending)
                .accessibilityIdentifier("inquiry.send")
                .listRowBackground(Color.clear)
                .listRowInsets(EdgeInsets())
            }
        }
    }

    private var success: some View {
        VStack(spacing: 20) {
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 56))
                .foregroundStyle(theme.primary)
            VStack(spacing: 8) {
                Text("Talebiniz alındı")
                    .font(theme.display(28, style: .title1))
                    .foregroundStyle(theme.isDark ? theme.text : theme.navy)
                Text("Ekibimiz \(hotelName) için talebinizi inceleyip \(draft.email) adresine dönüş yapacak. Talebiniz Kaydedilenler sekmesinde de duruyor.")
                    .font(theme.body(15))
                    .foregroundStyle(theme.textMuted)
                    .multilineTextAlignment(.center)
            }
            pushOptIn
            Button("Tamam") { dismiss() }
                .buttonStyle(.otsOutline)
        }
        .padding(24)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(theme.bg)
    }

    /// Cevap gelince telefona bildirim (e-postaya ek olarak).
    @ViewBuilder private var pushOptIn: some View {
        switch pushState {
        case .idle, .working:
            Button(action: enablePush) {
                if pushState == .working { ProgressView().tint(.white) } else { Label("Cevap gelince bildirim al", systemImage: "bell.badge.fill") }
            }
            .buttonStyle(.otsPrimary)
            .disabled(pushState == .working)
        case .enabled:
            Label("Cevap gelince bildirim alacaksınız.", systemImage: "bell.fill")
                .font(theme.body(15, weight: 600))
                .foregroundStyle(theme.primary)
        case .denied:
            Text("Bildirim izni kapalı. Ayarlar > Otelsayfam > Bildirimler'den açabilirsiniz; cevap e-postanıza da gelir.")
                .font(theme.body(14))
                .foregroundStyle(theme.textDim)
                .multilineTextAlignment(.center)
        case .failed(let message):
            Text(message).font(theme.body(14)).foregroundStyle(theme.textDim).multilineTextAlignment(.center)
        }
    }

    private func enablePush() {
        guard let inquiryId = sentInquiryId else { return }
        pushState = .working
        Task {
            guard let token = await PushCenter.shared.requestDeviceToken() else {
                pushState = .denied
                return
            }
            do {
                try await api.registerPush(inquiryId: inquiryId, deviceToken: token)
                pushState = .enabled
            } catch {
                pushState = .failed(String(localized: "Bildirim açılamadı; cevap e-postanıza gelecek."))
            }
        }
    }

    private func send() {
        if let problem = draft.validationError {
            errorMessage = problem
            return
        }
        errorMessage = nil
        isSending = true
        Task {
            defer { isSending = false }
            do {
                let receipt = try await api.sendInquiry(draft.body(hotelSlug: hotelSlug, source: source, tourId: tourId))
                draft.profile.save()
                InquiryLog.record(receipt, draft: draft, hotelSlug: hotelSlug, hotelName: hotelName, imageUrl: hotelImageUrl, in: context)
                withAnimation { sentInquiryId = receipt.id }
            } catch {
                errorMessage = error.localizedDescription
            }
        }
    }
}

#Preview {
    InquiryView(hotelSlug: "orucoglu-thermal-hotel", hotelName: "Oruçoğlu Thermal Hotel", rooms: [])
        .modelContainer(for: [SavedHotel.self, RecentHotel.self, SentInquiry.self], inMemory: true)
}
