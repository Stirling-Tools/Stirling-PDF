// swift-tools-version:5.3

import PackageDescription

let package = Package(
  name: "tauri-plugin-document-scanner",
  platforms: [
    .iOS(.v13)
  ],
  products: [
    .library(
      name: "tauri-plugin-document-scanner",
      type: .static,
      targets: ["tauri-plugin-document-scanner"])
  ],
  dependencies: [
    .package(name: "Tauri", path: "../.tauri/tauri-api")
  ],
  targets: [
    .target(
      name: "tauri-plugin-document-scanner",
      dependencies: [
        .byName(name: "Tauri")
      ],
      path: "Sources")
  ]
)
