import SwiftUI
import ReadingCore

private func listeningTime(_ seconds: TimeInterval) -> String {
    let value = max(0, Int(seconds.isFinite ? seconds : 0))
    return String(format: "%d:%02d", value / 60, value % 60)
}

struct MiniListeningPlayer: View {
    let player: ListeningPlayer
    let expand: () -> Void
    var body: some View {
        HStack(spacing: 12) {
            Button(action: expand) {
                HStack(spacing: 12) {
                    Image(systemName: "waveform").font(.title2).frame(width: 36)
                    VStack(alignment: .leading, spacing: 3) {
                        Text(player.document?.title ?? "Listening").font(.subheadline.bold()).lineLimit(1)
                        Text(player.state == .buffering ? "Preparing section…" : "Silent preview · \(listeningTime(player.remaining)) left")
                            .font(.caption).foregroundStyle(.secondary)
                    }
                    Spacer(minLength: 0)
                }.contentShape(Rectangle())
            }.buttonStyle(.plain).accessibilityLabel("Expand listening player").accessibilityIdentifier("expandPlayer")
            Button { player.toggle() } label: {
                Image(systemName: player.isPlaying ? "pause.fill" : "play.fill").frame(width: 44, height: 44)
            }.accessibilityLabel(player.isPlaying ? "Pause preview" : "Play preview")
            Button { player.close() } label: { Image(systemName: "xmark").frame(width: 32, height: 44) }
                .accessibilityLabel("Close listening player")
        }
        .padding(.horizontal, 16).padding(.vertical, 6)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 22))
        .overlay(RoundedRectangle(cornerRadius: 22).stroke(.primary.opacity(0.08)))
        .padding(.horizontal, 12).padding(.bottom, 6)
    }
}

struct ListeningPlayerView: View {
    let player: ListeningPlayer
    @Environment(\.dismiss) private var dismiss
    @State private var scrubTime = 0.0
    @State private var scrubbing = false
    private var status: String {
        switch player.state {
        case .idle: "Ready"
        case .buffering: "Preparing this section…"
        case .playing: "Preview running"
        case .paused: "Paused"
        case .finished: "Finished"
        case .failed: "Could not prepare audio"
        }
    }
    private var sleepLabel: String {
        if player.sleepAtEnd { return "End" }
        if let date = player.sleepDeadline { return "\(max(1, Int(ceil(date.timeIntervalSinceNow / 60))))m" }
        return "Sleep"
    }
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 24) {
                    ZStack {
                        RoundedRectangle(cornerRadius: 28).fill(.indigo.gradient)
                        Image(systemName: "text.book.closed.fill").font(.system(size: 90, weight: .light)).foregroundStyle(.white)
                    }
                    .frame(maxWidth: 300).frame(height: 230).accessibilityHidden(true)
                    VStack(spacing: 8) {
                        Text(player.document?.title ?? "Listening").font(.title2.bold()).multilineTextAlignment(.center)
                        Text("Silent listening preview").font(.subheadline).foregroundStyle(.secondary)
                        Text(status).font(.caption).foregroundStyle(.secondary).accessibilityIdentifier("playbackStatus")
                    }
                    VStack(spacing: 6) {
                        Slider(value: Binding(get: { scrubbing ? scrubTime : min(player.elapsed, player.total) }, set: { scrubTime = $0 }),
                               in: 0...max(0.01, player.total), onEditingChanged: { editing in
                            if editing { scrubTime = player.elapsed; scrubbing = true }
                            else { player.seek(to: scrubTime); scrubbing = false }
                        })
                        .accessibilityLabel("Playback position").accessibilityIdentifier("playbackPosition")
                        HStack {
                            Text(listeningTime(scrubbing ? scrubTime : player.elapsed))
                            Spacer()
                            Text("−" + listeningTime(player.remaining))
                        }.font(.caption.monospacedDigit()).foregroundStyle(.secondary)
                        Text(player.timelineIsEstimated ? "Estimated length · Refines as sections are prepared" : "All section lengths available")
                            .font(.caption2).foregroundStyle(.secondary)
                    }
                    HStack(spacing: 38) {
                        Button { player.skip(-15) } label: { Image(systemName: "gobackward.15").font(.title) }
                            .accessibilityLabel("Back 15 seconds")
                        Button { player.toggle() } label: {
                            ZStack {
                                Circle().fill(.indigo).frame(width: 76, height: 76)
                                Image(systemName: player.isPlaying ? "pause.fill" : "play.fill").font(.title).foregroundStyle(.white)
                            }
                        }.accessibilityLabel(player.isPlaying ? "Pause preview" : "Play preview").accessibilityIdentifier("playerPlayPause")
                        Button { player.skip(15) } label: { Image(systemName: "goforward.15").font(.title) }
                            .accessibilityLabel("Forward 15 seconds")
                    }.buttonStyle(.plain)
                    HStack(alignment: .top, spacing: 20) {
                        Menu {
                            ForEach([0.5, 0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.5, 1.8, 2, 2.5, 3], id: \.self) { speed in
                                Button { player.setRate(speed) } label: {
                                    Label("\(speed.formatted())×", systemImage: player.rate == speed ? "checkmark" : "")
                                }
                            }
                        } label: { controlLabel("\(player.rate.formatted())×", icon: "speedometer") }
                        .accessibilityLabel("Playback speed").accessibilityValue("\(player.rate.formatted()) times").accessibilityIdentifier("playbackSpeed")
                        Menu {
                            ForEach(player.voices) { voice in
                                Button { player.setVoice(voice) } label: {
                                    Label(voice.name, systemImage: player.voice == voice ? "checkmark" : "")
                                }
                            }
                        } label: { controlLabel(player.voice.name, icon: "person.wave.2") }
                        .accessibilityLabel("Preview voice").accessibilityValue(player.voice.name).accessibilityIdentifier("playbackVoice")
                        Menu {
                            Button("Off") { player.setSleep(minutes: nil) }
                            ForEach([5, 10, 15, 30, 45, 60], id: \.self) { minutes in
                                Button("\(minutes) minutes") { player.setSleep(minutes: minutes) }
                            }
                            Button("End of article") { player.setSleepAtEnd() }
                        } label: { controlLabel(sleepLabel, icon: "moon.zzz") }
                        .accessibilityLabel("Sleep timer").accessibilityIdentifier("sleepTimer")
                    }.frame(maxWidth: .infinity)
                    if case .failed(let message) = player.state {
                        VStack(spacing: 8) {
                            Text(message).font(.callout)
                            Button("Retry section") { player.resume() }.buttonStyle(.bordered)
                        }.accessibilityIdentifier("playbackError")
                    }
                    if let chunk = player.currentChunk {
                        VStack(alignment: .leading, spacing: 8) {
                            HStack {
                                Text("Paragraph \(chunk.paragraph + 1)").font(.caption.bold())
                                Spacer()
                                Text("\(player.cachedChunkCount) sections ready").font(.caption).foregroundStyle(.secondary)
                            }
                            Text(chunk.text).font(.callout).lineLimit(5)
                        }.padding(16).frame(maxWidth: .infinity, alignment: .leading)
                            .background(.quaternary, in: RoundedRectangle(cornerRadius: 16))
                    }
                    Text("No speech service is connected. Text stays on this device. Progress and word timing are simulated.")
                        .font(.footnote).foregroundStyle(.secondary).multilineTextAlignment(.center)
                }.padding(24).frame(maxWidth: 560).frame(maxWidth: .infinity)
            }
            .navigationTitle("Listening").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("Done") { dismiss() } } }
        }
        .presentationDetents([.large]).presentationDragIndicator(.visible)
    }
    private func controlLabel(_ title: String, icon: String) -> some View {
        VStack(spacing: 8) {
            Image(systemName: icon).font(.title3)
            Text(title).font(.caption).lineLimit(2).multilineTextAlignment(.center)
        }.frame(maxWidth: .infinity).frame(minHeight: 56)
    }
}
