import SwiftUI

struct TourPlayerView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.api) private var api
    @Environment(\.theme) private var theme
    let model: TourPlayerModel
    @State private var guide: GuideModel?
    @State private var presentedGuide: GuideModel?

    var body: some View {
        ZStack {
            PlayerLayerView(player: model.player)
                .ignoresSafeArea()
                .onTapGesture { model.togglePlayback() }

            VStack(spacing: 0) {
                topBar
                Spacer()
                if let callout = model.callout, model.machine.phase == .playing {
                    calloutCard(callout)
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                }
                bottomPanel
            }
            .animation(.easeInOut(duration: 0.25), value: model.callout)
            .animation(.easeInOut(duration: 0.25), value: model.machine.phase)
        }
        .preferredColorScheme(.dark)
        .tint(theme.isDark ? theme.cta : theme.primary)
        .statusBarHidden()
        .onAppear { model.start() }
        .onDisappear { model.stop() }
        .sheet(item: $presentedGuide) { guide in
            GuideView(model: guide) { question in
                InquiryView(hotelSlug: model.hotelSlug, hotelName: model.title ?? String(localized: "Otel"), rooms: [], source: .tour, tourId: model.tourId, initialMessage: question)
            }
                .environment(\.theme, theme)
                .presentationDetents([.medium, .large])
                .presentationBackgroundInteraction(.enabled(upThrough: .medium))
        }
    }

    private func openGuide() {
        if guide == nil {
            let guide = GuideModel(hotelSlug: model.hotelSlug, hotelName: model.title ?? String(localized: "Bu otel"), tourId: model.tourId, api: api)
            guide.onNavigate = { [model] stepId in model.go(toStepId: stepId) }
            guide.tourPosition = { [model] in (model.machine.current?.stepId ?? "", model.seenStepIds) }
            self.guide = guide
        }
        presentedGuide = guide
    }

    private var topBar: some View {
        HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: 2) {
                if let title = model.title {
                    Text(title).font(.caption).foregroundStyle(.secondary)
                }
                Text(model.machine.current?.title ?? "")
                    .font(theme.display(22, style: .title3))
                Text("Durak \(model.machine.index + 1) / \(model.machine.steps.count)")
                    .font(.caption.monospacedDigit())
                    .foregroundStyle(.secondary)
            }
            Spacer()
            Button("Rehbere sor", systemImage: "sparkles", action: openGuide)
                .labelStyle(.iconOnly)
                .font(.title3)
                .padding(10)
                .background(.ultraThinMaterial, in: .circle)
            Button("Turu kapat", systemImage: "xmark") { dismiss() }
                .labelStyle(.iconOnly)
                .font(.title3)
                .padding(10)
                .background(.ultraThinMaterial, in: .circle)
        }
        .padding()
        .background(LinearGradient(colors: [.black.opacity(0.6), .clear], startPoint: .top, endPoint: .bottom))
    }

    private func calloutCard(_ callout: Tour.Callout) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(callout.title).font(.subheadline.weight(.semibold))
            if let body = callout.body { Text(body).font(.footnote).foregroundStyle(.secondary) }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(.ultraThinMaterial, in: .rect(cornerRadius: 14))
        .padding(.horizontal)
        .padding(.bottom, 8)
        .accessibilityElement(children: .combine)
    }

    private var bottomPanel: some View {
        VStack(spacing: 12) {
            phaseActions
            stepStrip
        }
        .padding(.vertical, 12)
        .background(LinearGradient(colors: [.clear, .black.opacity(0.7)], startPoint: .top, endPoint: .bottom))
    }

    @ViewBuilder private var phaseActions: some View {
        switch model.machine.phase {
        case .loading:
            ProgressView()
        case .playing:
            EmptyView()
        case .waitingForContinue:
            if let step = model.machine.current, !step.branches.isEmpty {
                VStack(spacing: 8) {
                    ForEach(step.branches) { branch in
                        Button(branch.label) { model.choose(branch) }
                            .buttonStyle(.borderedProminent)
                    }
                    if !model.machine.isLastStep {
                        Button("Sıradaki durağa geç") { model.continueTour() }.buttonStyle(.bordered)
                    }
                }
            } else {
                Button(model.machine.isLastStep ? String(localized: "Turu bitir") : String(localized: "Devam"), systemImage: "play.fill") { model.continueTour() }
                    .buttonStyle(.borderedProminent)
                    .controlSize(.large)
            }
        case .ended:
            HStack {
                Button("Tekrar izle", systemImage: "arrow.counterclockwise") { model.restart() }
                    .buttonStyle(.bordered)
                Button("Otele dön") { dismiss() }
                    .buttonStyle(.borderedProminent)
            }
            .controlSize(.large)
        case .failed(let message):
            VStack(spacing: 8) {
                Text(message).font(.footnote).multilineTextAlignment(.center)
                Button("Tekrar dene", systemImage: "arrow.clockwise") { model.go(to: model.machine.index) }
                    .buttonStyle(.borderedProminent)
            }
            .padding(.horizontal)
        }
    }

    private var stepStrip: some View {
        ScrollView(.horizontal) {
            HStack(spacing: 8) {
                ForEach(Array(model.machine.steps.enumerated()), id: \.element.id) { index, step in
                    Button { model.go(to: index) } label: {
                        Text(step.title)
                            .font(.footnote.weight(index == model.machine.index ? .semibold : .regular))
                            .padding(.horizontal, 12)
                            .padding(.vertical, 8)
                            .background(index == model.machine.index ? AnyShapeStyle(.tint) : AnyShapeStyle(.ultraThinMaterial), in: .capsule)
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(index == model.machine.index ? .isSelected : [])
                }
            }
            .padding(.horizontal)
        }
        .scrollIndicators(.hidden)
    }
}
