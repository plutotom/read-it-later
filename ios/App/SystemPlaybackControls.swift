import AVFoundation
import MediaPlayer
import ReadingCore

@MainActor final class SystemPlaybackControls {
    private weak var player: ListeningPlayer?
    private var task: Task<Void, Never>?
    private var observers: [NSObjectProtocol] = []
    private var resumeAfterInterruption = false
    private var interruptionToken: UUID?
    init(player: ListeningPlayer) {
        self.player = player
        let center = MPRemoteCommandCenter.shared()
        center.playCommand.addTarget { @Sendable [weak player] _ in Task { @MainActor in player?.resume() }; return .success }
        center.pauseCommand.addTarget { @Sendable [weak player] _ in Task { @MainActor in player?.pause() }; return .success }
        center.togglePlayPauseCommand.addTarget { @Sendable [weak player] _ in Task { @MainActor in player?.toggle() }; return .success }
        center.skipForwardCommand.preferredIntervals = [15]
        center.skipBackwardCommand.preferredIntervals = [15]
        center.skipForwardCommand.addTarget { @Sendable [weak player] _ in Task { @MainActor in player?.skip(15) }; return .success }
        center.skipBackwardCommand.addTarget { @Sendable [weak player] _ in Task { @MainActor in player?.skip(-15) }; return .success }
        center.changePlaybackPositionCommand.addTarget { @Sendable [weak player] event in
            guard let event = event as? MPChangePlaybackPositionCommandEvent else { return .commandFailed }
            let time = event.positionTime; Task { @MainActor in player?.seek(to: time) }; return .success
        }
        center.changePlaybackRateCommand.supportedPlaybackRates = [0.5, 0.8, 1, 1.2, 1.5, 2, 2.5, 3]
        center.changePlaybackRateCommand.addTarget { @Sendable [weak player] event in
            guard let event = event as? MPChangePlaybackRateCommandEvent else { return .commandFailed }
            let rate = Double(event.playbackRate); Task { @MainActor in player?.setRate(rate) }; return .success
        }
        observers.append(NotificationCenter.default.addObserver(forName: AVAudioSession.interruptionNotification, object: nil, queue: .main) { @Sendable [weak self] notification in
            let type = notification.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt
            let options = notification.userInfo?[AVAudioSessionInterruptionOptionKey] as? UInt ?? 0
            Task { @MainActor [weak self] in
                guard let self, let player = self.player else { return }
                if type == AVAudioSession.InterruptionType.began.rawValue {
                    self.resumeAfterInterruption = player.isPlaying; player.pause(); self.interruptionToken = player.intentToken
                } else if type == AVAudioSession.InterruptionType.ended.rawValue {
                    let unchanged = self.interruptionToken == player.intentToken
                    let resume = self.resumeAfterInterruption && unchanged && options & AVAudioSession.InterruptionOptions.shouldResume.rawValue != 0
                    self.resumeAfterInterruption = false; self.interruptionToken = nil
                    if resume { player.resume() }
                }
            }
        })
        observers.append(NotificationCenter.default.addObserver(forName: AVAudioSession.routeChangeNotification, object: nil, queue: .main) { @Sendable [weak player] notification in
            let reason = notification.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt
            if reason == AVAudioSession.RouteChangeReason.oldDeviceUnavailable.rawValue { Task { @MainActor in player?.pause() } }
        })
        task = Task { [weak self] in
            while !Task.isCancelled {
                self?.update(); try? await Task.sleep(for: .milliseconds(500))
            }
        }
    }
    private func update() {
        guard let player, let document = player.document, !player.isSilentPreview else { MPNowPlayingInfoCenter.default().nowPlayingInfo = nil; return }
        MPNowPlayingInfoCenter.default().nowPlayingInfo = [
            MPMediaItemPropertyTitle: document.title,
            MPMediaItemPropertyArtist: "Read It Later",
            MPMediaItemPropertyPlaybackDuration: player.total,
            MPNowPlayingInfoPropertyElapsedPlaybackTime: player.elapsed,
            MPNowPlayingInfoPropertyPlaybackRate: player.isPlaying ? player.rate : 0,
            MPNowPlayingInfoPropertyDefaultPlaybackRate: 1,
        ]
    }
}
