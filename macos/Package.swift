// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "Lattice",
    platforms: [.macOS(.v14)],
    products: [
        .executable(name: "Lattice", targets: ["Lattice"]),
    ],
    targets: [
        .executableTarget(
            name: "Lattice",
            path: "Lattice"
        ),
    ]
)
