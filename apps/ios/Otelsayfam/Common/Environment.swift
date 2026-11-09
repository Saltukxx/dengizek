import SwiftUI

extension EnvironmentValues {
    /// Önizlemelerde ve testlerde farklı bir sunucuya yönlendirmek için.
    @Entry var api: APIClient = .live
}

/// Yükleme durumu: ekranlar aynı üç hâli gösterir.
enum Loadable<Value: Sendable>: Sendable {
    case loading
    case loaded(Value)
    case failed(String)
}
