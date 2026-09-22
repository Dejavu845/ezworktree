import Foundation

enum EngineError: LocalizedError {
    case badURL
    case server(String)

    var errorDescription: String? {
        switch self {
        case .badURL: return "Engine URL is invalid"
        case .server(let message): return message
        }
    }
}

struct EngineClient {
    var baseURL = URL(string: "http://127.0.0.1:7780")!

    func snapshot() async throws -> Snapshot {
        try await get("/api/snapshot")
    }

    func openWorktree(rootPath: String, taskId: String) async throws {
        try await postVoid("/api/worktrees/open", ["rootPath": rootPath, "taskId": taskId])
    }

    func generateHandoff(rootPath: String, taskId: String) async throws {
        try await postVoid("/api/handoff", ["rootPath": rootPath, "taskId": taskId])
    }

    func blast(rootPath: String, taskId: String) async throws -> BlastReport {
        try await post("/api/blast", ["rootPath": rootPath, "taskId": taskId])
    }

    func settings() async throws -> AppSettings {
        try await get("/api/settings")
    }

    func updateSettings(_ settings: AppSettings) async throws -> AppSettings {
        try await postJSON("/api/settings", settings)
    }

    func decide(rootPath: String, id: String, approve: Bool) async throws {
        struct Body: Encodable {
            let rootPath: String
            let id: String
            let approve: Bool
        }
        let _: ConsentRequest = try await postJSON("/api/requests/decide", Body(rootPath: rootPath, id: id, approve: approve))
    }

    private func tagged(_ url: URL, method: String = "GET") -> URLRequest {
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("human", forHTTPHeaderField: "X-Workzoon-Actor")
        return request
    }

    private func get<T: Decodable>(_ path: String) async throws -> T {
        guard let url = URL(string: path, relativeTo: baseURL) else { throw EngineError.badURL }
        let (data, response) = try await URLSession.shared.data(for: tagged(url))
        if let http = response as? HTTPURLResponse, http.statusCode >= 400 {
            if let err = try? JSONDecoder().decode([String: String].self, from: data), let message = err["error"] {
                throw EngineError.server(message)
            }
            throw EngineError.server("Engine returned \(http.statusCode)")
        }
        return try JSONDecoder().decode(T.self, from: data)
    }

    private func post<T: Decodable>(_ path: String, _ body: [String: String]) async throws -> T {
        guard let url = URL(string: path, relativeTo: baseURL) else { throw EngineError.badURL }
        var request = tagged(url, method: "POST")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(body)
        let (data, _) = try await URLSession.shared.data(for: request)
        if let decoded = try? JSONDecoder().decode(T.self, from: data) {
            return decoded
        }
        if let err = try? JSONDecoder().decode([String: String].self, from: data), let message = err["error"] {
            throw EngineError.server(message)
        }
        throw EngineError.server("Unexpected engine response")
    }

    private func postJSON<T: Decodable, B: Encodable>(_ path: String, _ body: B) async throws -> T {
        guard let url = URL(string: path, relativeTo: baseURL) else { throw EngineError.badURL }
        var request = tagged(url, method: "POST")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(body)
        let (data, response) = try await URLSession.shared.data(for: request)
        if let http = response as? HTTPURLResponse, http.statusCode >= 400 {
            if let err = try? JSONDecoder().decode([String: String].self, from: data), let message = err["error"] {
                throw EngineError.server(message)
            }
            throw EngineError.server("Engine returned \(http.statusCode)")
        }
        return try JSONDecoder().decode(T.self, from: data)
    }

    private func postVoid(_ path: String, _ body: [String: String]) async throws {
        guard let url = URL(string: path, relativeTo: baseURL) else { throw EngineError.badURL }
        var request = tagged(url, method: "POST")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(body)
        let (data, response) = try await URLSession.shared.data(for: request)
        if let http = response as? HTTPURLResponse, http.statusCode >= 400 {
            if let err = try? JSONDecoder().decode([String: String].self, from: data), let message = err["error"] {
                throw EngineError.server(message)
            }
            throw EngineError.server("Engine returned \(http.statusCode)")
        }
    }
}
