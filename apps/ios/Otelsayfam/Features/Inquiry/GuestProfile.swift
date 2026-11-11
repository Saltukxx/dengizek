import Foundation

/// Misafirin talep formuna yazdığı ad ve e-posta. İlk talepten sonra cihazda
/// saklanır, sonraki formlar dolu açılır. Sunucuya yalnız talep ile gider.
struct GuestProfile: Codable, Equatable, Sendable {
    var name = ""
    var email = ""

    private static let key = "ots.guest"

    static func load(from defaults: UserDefaults = .standard) -> GuestProfile {
        guard let data = defaults.data(forKey: key), let profile = try? JSONDecoder().decode(GuestProfile.self, from: data) else {
            return GuestProfile()
        }
        return profile
    }

    func save(to defaults: UserDefaults = .standard) {
        guard let data = try? JSONEncoder().encode(self) else { return }
        defaults.set(data, forKey: Self.key)
    }
}
