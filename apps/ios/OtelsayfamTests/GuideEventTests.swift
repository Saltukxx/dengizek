import Testing
@testable import Otelsayfam

struct GuideEventTests {
    @Test func parsesEachServerEvent() {
        #expect(GuideEvent.parse(line: #"data: {"type":"text","delta":"Merhaba"}"#) == .text("Merhaba"))
        #expect(GuideEvent.parse(line: #"data: {"type":"navigate","stepId":"s2"}"#) == .navigate(stepId: "s2"))
        #expect(GuideEvent.parse(line: #"data: {"type":"chips","chips":["Havuz?"]}"#) == .chips(["Havuz?"]))
        #expect(GuideEvent.parse(line: #"data: {"type":"inquiry"}"#) == .inquiry)
        #expect(GuideEvent.parse(line: #"data: {"type":"done"}"#) == .done)
        let fact = GuideEvent.parse(line: #"data: {"type":"fact","card":{"kind":"verified","label":"Doğrulanmış bilgi","text":"Check-in saati: 14:00"}}"#)
        #expect(fact == .fact(FactCard(kind: "verified", label: "Doğrulanmış bilgi", title: nil, text: "Check-in saati: 14:00")))
    }

    @Test func ignoresNonDataLinesAndUnknownTypes() {
        #expect(GuideEvent.parse(line: "") == nil)
        #expect(GuideEvent.parse(line: ": ping") == nil)
        #expect(GuideEvent.parse(line: #"data: {"type":"yeni-bir-olay"}"#) == .unknown)
    }
}
