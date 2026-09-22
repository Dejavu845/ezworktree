import Foundation

struct CatalogGroup: Codable, Identifiable {
    let id: String
    let name: String
    let sort: Int
}

struct CatalogProject: Codable, Identifiable {
    let id: String
    let name: String
    let rootPath: String
    let groupId: String?
}

struct Catalog: Codable {
    let groups: [CatalogGroup]
    let projects: [CatalogProject]
    let latticeHome: String
    let settings: AppSettings?
}

struct Layer: Codable, Identifiable {
    let id: String
    let name: String
    let paths: [String]
    let frozen: Bool
}

struct Charter: Codable {
    let purpose: String
    let architecture: String
    let conventions: [String]
    let doNotTouch: [String]
    let layers: [Layer]
}

struct WorkzoonTask: Codable, Identifiable {
    let id: String
    let slug: String
    let title: String
    let status: String
    let agent: String
    let allowedPaths: [String]
    let allowFrozenTouch: Bool
    let worktreeId: String?
}

struct Worktree: Codable, Identifiable {
    let id: String
    let taskId: String
    let path: String
    let branch: String
    let status: String
}

struct Project: Codable, Identifiable {
    let id: String
    let name: String
    let rootPath: String
    let groupId: String?
    let baseBranch: String
    let charter: Charter
    let policy: Policy?
    let tasks: [WorkzoonTask]
    let worktrees: [Worktree]
}

struct Snapshot: Codable {
    let catalog: Catalog
    let projects: [Project]
    let maps: [RepoMap]?
    let requests: [ConsentRequest]?
    let ledgerTail: [LedgerTail]?
}

struct AppSettings: Codable {
    var openIn: String
    var worktreesRoot: String
    var defaultPreset: String
    var confirmDestructive: Bool
    var motion: String
    var skin: String
}

struct PolicyWiki: Codable {
    var ingestHandoffs: String
    var agentWrites: [String: Bool]
    var gate: String
}

struct Policy: Codable {
    var version: Int
    var preset: String
    var agentMay: [String: String]
    var wiki: PolicyWiki
    var declared: [String: String]
    var updatedAt: String
    var updatedBy: String
}

struct ConsentRequest: Codable, Identifiable {
    let id: String
    let action: String
    let actor: String
    let agent: String
    let reason: String
    let createdAt: String
    let status: String
    let rootPath: String?
}

struct LedgerTail: Codable {
    let rootPath: String
    let lines: [String]
}

struct RepoLane: Codable, Identifiable {
    let id: String
    let branch: String
    let sha: String
    let isHead: Bool
    let worktreePath: String
    let subject: String
    let managed: Bool
    let taskId: String?
    let taskTitle: String?
}

struct RepoMap: Codable {
    let rootPath: String
    let name: String
    let baseBranch: String
    let currentBranch: String
    let lanes: [RepoLane]
}

struct BlastFinding: Codable {
    let path: String
    let verdict: String
    let reason: String
}

struct BlastReport: Codable {
    let verdict: String
    let findings: [BlastFinding]
}
