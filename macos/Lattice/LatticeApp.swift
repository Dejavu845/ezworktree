import SwiftUI

@main
struct LatticeApp: App {
    var body: some Scene {
        Group {
            WindowGroup {
                ContentView()
            }
            .windowStyle(.automatic)
            .commands {
                CommandGroup(replacing: .newItem) {}
            }
            Settings {
                SettingsView()
                    .frame(minWidth: 360, minHeight: 240)
            }
        }
    }
}
