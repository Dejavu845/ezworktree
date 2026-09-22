import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { nowIso, uuid } from "./ids.ts";
import { actionLabel } from "./policy.ts";
import type { AgentAction, ConsentRequest, Project } from "./types.ts";

export function requestsDir(project: Project): string {
  return join(project.rootPath, ".lattice", "requests");
}

function requestFile(project: Project, id: string): string {
  return join(requestsDir(project), `${id}.json`);
}

export function listRequests(project: Project): ConsentRequest[] {
  const dir = requestsDir(project);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => JSON.parse(readFileSync(join(dir, name), "utf8")) as ConsentRequest)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function listPendingRequests(project: Project): ConsentRequest[] {
  return listRequests(project).filter((item) => item.status === "pending");
}

export function requestRejectReason(kind: "missing" | "not-pending" | "replay", id = ""): string {
  const trimmed = id.trim();
  if (kind === "missing") return trimmed ? `找不到请求「${trimmed}」。` : "还没写要批的请求。";
  if (kind === "not-pending") return `请求「${trimmed}」已经批过了。`;
  return `动作「${actionLabel(trimmed)}」不能再做一遍。`;
}

export function loadRequest(project: Project, id: string): ConsentRequest {
  const path = requestFile(project, id);
  if (!existsSync(path)) throw new Error(requestRejectReason("missing", id));
  return JSON.parse(readFileSync(path, "utf8")) as ConsentRequest;
}

export function saveRequest(project: Project, request: ConsentRequest): void {
  mkdirSync(requestsDir(project), { recursive: true });
  writeFileSync(requestFile(project, request.id), `${JSON.stringify(request, null, 2)}\n`);
}

export function createRequest(
  project: Project,
  input: {
    action: AgentAction;
    agent?: string;
    params: Record<string, unknown>;
    reason: string;
  },
): ConsentRequest {
  const request: ConsentRequest = {
    id: uuid(),
    action: input.action,
    actor: "agent",
    agent: input.agent || "agent",
    params: input.params,
    reason: input.reason,
    createdAt: nowIso(),
    status: "pending",
  };
  saveRequest(project, request);
  return request;
}
