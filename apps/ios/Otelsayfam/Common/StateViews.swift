import SwiftUI

struct ErrorStateView: View {
    let message: String
    let retry: () async -> Void

    var body: some View {
        ContentUnavailableView {
            Label("Yüklenemedi", systemImage: "wifi.exclamationmark")
        } description: {
            Text(message)
        } actions: {
            Button("Tekrar dene") { Task { await retry() } }
                .buttonStyle(.borderedProminent)
        }
    }
}
