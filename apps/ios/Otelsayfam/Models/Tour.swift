import Foundation

struct Tour: Codable, Hashable, Sendable {
    struct Media: Codable, Hashable, Sendable {
        /// "clip": adımın kendi videosu; "window": ortak videonun bir aralığı.
        let mode: String
        let src: String
        let startSec: Double?
        let endSec: Double?
    }

    struct Callout: Codable, Hashable, Identifiable, Sendable {
        let id: String
        let tSec: Double
        let title: String
        let body: String?
    }

    struct Branch: Codable, Hashable, Identifiable, Sendable {
        let id: String
        let label: String
        let nextStepId: String
    }

    struct Step: Codable, Hashable, Identifiable, Sendable {
        let stepId: String
        let kind: String
        let title: String
        let body: String?
        let requiresUserContinue: Bool
        let media: Media
        let captionsVttUrl: String?
        let callouts: [Callout]
        let branches: [Branch]

        var id: String { stepId }
    }

    let tourId: String
    let hotelSlug: String
    let title: String?
    let version: Int
    /// İmzalı video adreslerinin bitişi (UNIX saniye); nil ise süresiz.
    let mediaTokenExpiresAt: Double?
    let steps: [Step]
}
