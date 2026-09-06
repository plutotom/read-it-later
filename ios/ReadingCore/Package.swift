// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "ReadingCore",
    platforms: [.iOS(.v17), .macOS(.v14)],
    products: [.library(name: "ReadingCore", targets: ["ReadingCore"])],
    dependencies: [
        .package(url: "https://github.com/groue/GRDB.swift.git", exact: "7.0.0"),
        .package(url: "https://github.com/scinfu/SwiftSoup.git", exact: "2.8.8")
    ],
    targets: [
        .target(name: "ReadingCore", dependencies: [.product(name: "GRDB", package: "GRDB.swift"), "SwiftSoup"]),
        .testTarget(name: "ReadingCoreTests", dependencies: ["ReadingCore"])
    ]
)
