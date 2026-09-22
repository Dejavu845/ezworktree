import SwiftUI

struct ContentView: View {
    @State private var snapshot: Snapshot?
    @State private var selectedProjectID: String?
    @State private var selectedTaskID: String?
    @State private var blast: BlastReport?
    @State private var errorText = ""
    private let client = EngineClient()

    var project: Project? {
        snapshot?.projects.first(where: { $0.id == selectedProjectID }) ?? snapshot?.projects.first
    }

    var task: WorkzoonTask? {
        project?.tasks.first(where: { $0.id == selectedTaskID }) ?? project?.tasks.first
    }

    var body: some View {
        NavigationSplitView {
            List(selection: $selectedProjectID) {
                ForEach(snapshot?.catalog.groups ?? []) { group in
                    Section(group.name) {
                        ForEach(snapshot?.projects.filter { ($0.groupId ?? "studio") == group.id } ?? []) { item in
                            Text(item.name).tag(item.id)
                        }
                    }
                }
            }
            .navigationTitle("Agent Workzoon")
        } content: {
            if let project {
                List(selection: $selectedTaskID) {
                    Section(project.name) {
                        ForEach(project.tasks) { item in
                            VStack(alignment: .leading, spacing: 2) {
                                Text(item.title)
                                Text("lattice/\(item.slug)")
                                    .font(.system(.caption, design: .monospaced))
                                Text("\(item.status) · \(item.agent)")
                                    .foregroundStyle(.secondary)
                                    .font(.caption2)
                            }
                            .tag(item.id)
                        }
                    }
                }
            } else {
                ContentUnavailableView("还没有项目", systemImage: "square.3.layers.3d", description: Text("先启动 engine，再登记一个 git 仓。"))
            }
        } detail: {
            if let project, let task {
                Form {
                    Section("宪章") {
                        Text(project.charter.purpose)
                        ForEach(project.charter.layers) { layer in
                            LabeledContent(layer.name, value: layer.frozen ? "冻 · \(layer.paths.joined(separator: ", "))" : "开 · \(layer.paths.joined(separator: ", "))")
                        }
                    }
                    Section("对照") {
                        LabeledContent("仓", value: project.rootPath)
                        LabeledContent("功能", value: task.title)
                        LabeledContent("分支", value: "lattice/\(task.slug)")
                        LabeledContent("范围", value: task.allowedPaths.joined(separator: ", ").ifEmpty("非冻层"))
                    }
                    Section("动作") {
                        Button("创建 worktree") {
                            Swift.Task { await run { try await client.openWorktree(rootPath: project.rootPath, taskId: task.id) } }
                        }
                        Button("生成交接") {
                            Swift.Task { await run { try await client.generateHandoff(rootPath: project.rootPath, taskId: task.id) } }
                        }
                        Button("检查影响范围") {
                            Swift.Task { await run { blast = try await client.blast(rootPath: project.rootPath, taskId: task.id) } }
                        }
                    }
                    if let blast {
                        Section("影响范围 · \(blast.verdict)") {
                            ForEach(blast.findings, id: \.path) { item in
                                LabeledContent(item.path, value: "\(item.verdict) · \(item.reason)")
                            }
                        }
                    }
                    if !errorText.isEmpty {
                        Section { Text(errorText).foregroundStyle(.red) }
                    }
                }
                .formStyle(.grouped)
            } else {
                ContentUnavailableView("先选一个任务", systemImage: "doc.text.badge.checkmark")
            }
        }
        .task { await reload() }
        .refreshable { await reload() }
    }

    private func reload() async {
        do {
            let next = try await client.snapshot()
            snapshot = next
            if selectedProjectID == nil {
                selectedProjectID = next.projects.first?.id
                selectedTaskID = next.projects.first?.tasks.first?.id
            }
        } catch {
            errorText = error.localizedDescription
        }
    }

    private func run(_ work: () async throws -> Void) async {
        do {
            try await work()
            await reload()
            errorText = ""
        } catch {
            errorText = error.localizedDescription
        }
    }
}

private extension String {
    func ifEmpty(_ fallback: String) -> String {
        isEmpty ? fallback : self
    }
}
