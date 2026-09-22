import SwiftUI

struct SettingsView: View {
    @State private var settings: AppSettings?
    @State private var errorText = ""
    private let client = EngineClient()

    var body: some View {
        Form {
            if let settings {
                Section("机器设置") {
                    LabeledContent("打开配方", value: settings.openIn)
                    Text("只复制命令，不启动外部 App")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                    LabeledContent("worktree 根目录", value: settings.worktreesRoot)
                    LabeledContent("新登记仓默认预设", value: settings.defaultPreset)
                    LabeledContent("破坏性操作要输入名称", value: settings.confirmDestructive ? "开" : "关")
                    LabeledContent("动效", value: settings.motion == "off" ? "关闭" : "跟随系统")
                    Picker("视图皮肤", selection: Binding(
                        get: { settings.skin },
                        set: { next in
                            var copy = settings
                            copy.skin = next
                            self.settings = copy
                            Swift.Task { try? await client.updateSettings(copy) }
                        }
                    )) {
                        Text("干练").tag("lean")
                        Text("工场").tag("forge")
                    }
                }
            } else if errorText.isEmpty {
                ProgressView("读取 App 设置…")
            }
            if !errorText.isEmpty {
                Section { Text(errorText).foregroundStyle(.red) }
            }
        }
        .formStyle(.grouped)
        .navigationTitle("设置")
        .task { await load() }
    }

    private func load() async {
        do {
            settings = try await client.settings()
            errorText = ""
        } catch {
            errorText = error.localizedDescription
        }
    }
}
