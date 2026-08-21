// swift-tools-version: 5.9

// The fork of @capacitor/keyboard 8.0.5 — see Keyboard.m for the whole diff
// (two numbers added to the willShow payload; behaviour untouched).
//
// BOTH names below are locked to what the Capacitor CLI derives from the npm
// package name: `cap sync` writes `.package(name: "CluecabKeyboard", …)` and
// `.product(name: "CluecabKeyboard", …)` into ios/App/CapApp-SPM/Package.swift
// (its fixName('cluecab-keyboard')), and SPM resolves that only if the package
// name and a library product here both match it exactly. Rename the npm
// package and these two must follow.

import PackageDescription

let package = Package(
    name: "CluecabKeyboard",
    platforms: [.iOS(.v15)],
    products: [
        .library(
            name: "CluecabKeyboard",
            targets: ["KeyboardPlugin"])
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", from: "8.0.0")
    ],
    targets: [
        .target(
            name: "KeyboardPlugin",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm")],
            path: "ios/Sources/KeyboardPlugin",
            publicHeadersPath: "include")
    ]
)
