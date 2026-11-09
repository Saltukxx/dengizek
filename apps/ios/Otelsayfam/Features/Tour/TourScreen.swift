import SwiftUI

/// Turu sunucudan yükler, sonra oynatıcıyı açar. Tam ekran gösterilir.
struct TourScreen: View {
    @Environment(\.api) private var api
    @Environment(\.dismiss) private var dismiss
    let hotelSlug: String
    let tourId: String
    @State private var state: Loadable<TourPlayerModel> = .loading

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            switch state {
            case .loading:
                ProgressView().tint(.white)
            case .failed(let message):
                ErrorStateView(message: message) { await load() }
                    .environment(\.colorScheme, .dark)
            case .loaded(let model):
                TourPlayerView(model: model)
            }
        }
        .overlay(alignment: .topLeading) {
            if case .loaded = state {} else { closeButton }
        }
        .task { await load() }
    }

    private var closeButton: some View {
        Button("Kapat", systemImage: "xmark") { dismiss() }
            .labelStyle(.iconOnly)
            .buttonStyle(.bordered)
            .buttonBorderShape(.circle)
            .tint(.white)
            .padding()
    }

    private func load() async {
        do {
            let tour = try await api.tour(hotelSlug: hotelSlug, tourId: tourId)
            state = .loaded(TourPlayerModel(tour: tour, resolve: api.resolve))
        } catch is CancellationError {
        } catch {
            state = .failed(error.localizedDescription)
        }
    }
}

#Preview("Demo tur (yerel seed)") {
    TourScreen(hotelSlug: "aurelia-bay", tourId: "demo-lobby")
}
