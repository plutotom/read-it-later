import Foundation

/// Decimal sizes match the storage labels shown in Settings.
public enum CacheLimit: Int, CaseIterable, Sendable {
    case mb50 = 50_000_000
    case mb100 = 100_000_000
    case mb200 = 200_000_000
    case mb500 = 500_000_000
    case gb1 = 1_000_000_000
    case unlimited = 0

    public var bytes: Int { self == .unlimited ? Int.max : rawValue }
    public var label: String {
        switch self {
        case .mb50: "50 MB"
        case .mb100: "100 MB"
        case .mb200: "200 MB"
        case .mb500: "500 MB"
        case .gb1: "1 GB"
        case .unlimited: "Unlimited"
        }
    }
}
