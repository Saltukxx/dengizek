import CryptoKit
import Foundation

/// Son başarılı API yanıtları diskte durur: bağlantı yokken misafir en son
/// gördüğü listeyi ve otel sayfasını yine görebilir. Sistem yer gerektiğinde
/// `Caches` klasörünü boşaltabilir; kayıp sorun değildir.
struct ResponseCache: Sendable {
    let directory: URL

    static let shared = ResponseCache(
        directory: URL.cachesDirectory.appending(path: "ots-api", directoryHint: .isDirectory)
    )

    func store(_ data: Data, for url: URL) {
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        try? data.write(to: file(for: url), options: .atomic)
    }

    func data(for url: URL) -> Data? {
        try? Data(contentsOf: file(for: url))
    }

    private func file(for url: URL) -> URL {
        let digest = SHA256.hash(data: Data(url.absoluteString.utf8))
        return directory.appending(path: digest.map { String(format: "%02x", $0) }.joined() + ".json")
    }
}

/// Sunucudan gelen değer; `isStale` ise bağlantı yoktu, son kayıt gösteriliyor.
struct Fetched<Value: Sendable>: Sendable {
    let value: Value
    let isStale: Bool
}
