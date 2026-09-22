export type Layer = { id: string; name: string; paths: string[]; frozen: boolean };
export type Charter = {
  version: number;
  purpose: string;
  architecture: string;
  conventions: string[];
  doNotTouch: string[];
  layers: Layer[];
};
export type Escalation = {
  reason: string;
  by: "human" | "agent";
  agent?: string;
  at: string;
  requestId?: string;
};
export type Task = {
  id: string;
  slug: string;
  title: string;
  status: "backlog" | "active" | "review" | "done" | "blocked";
  intent?: "feat" | "spike" | "hotfix";
  baseBranch?: string;
  agent: string;
  allowedPaths: string[];
  forbiddenPaths: string[];
  layerIds: string[];
  allowFrozenTouch: boolean;
  escalation?: Escalation;
  worktreeId?: string;
  handoffId?: string;
  notes: string;
};
export type Worktree = {
  id: string;
  taskId: string;
  path: string;
  branch: string;
  status: string;
};
export type Project = {
  id: string;
  name: string;
  rootPath: string;
  groupId?: string;
  baseBranch: string;
  charter: Charter;
  policy?: Policy;
  tasks: Task[];
  worktrees: Worktree[];
  handoffs: { id: string; taskId: string; path: string }[];
};
export type HygieneKind = "merged" | "stale" | "no-handoff";
export type Drift = { file: string; kind: "edited" | "missing" | "stale"; recorded?: string; actual?: string };
export type RepoLane = {
  id: string;
  branch: string;
  sha: string;
  isHead: boolean;
  isRemote: boolean;
  worktreePath: string;
  subject: string;
  managed: boolean;
  taskId?: string;
  taskTitle?: string;
  taskStatus?: Task["status"];
  baseBranch?: string;
  updatedAt: string;
  merged: boolean;
  hygiene: HygieneKind[];
  undeclared?: boolean;
};
export type RepoMap = {
  rootPath: string;
  name: string;
  baseBranch: string;
  currentBranch: string;
  lanes: RepoLane[];
  worktrees: { path: string; branch: string; isPrimary: boolean }[];
};
export type Artifact = {
  name: string;
  path: string;
  kind: "file" | "dir";
  ignored: boolean;
  bytes: number;
  checkout: string;
  branch?: string;
  sha?: string;
  pinnedId?: string;
};
export type ArtifactVersion = {
  id: string;
  name: string;
  kind: "file" | "dir";
  path: string;
  checkout: string;
  branch: string;
  sha: string;
  dirty: boolean;
  contentHash: string;
  files: number;
  bytes: number;
  builtAt: string;
  pinnedAt: string;
  pinnedBy: { actor: "human" | "agent"; agent?: string };
  taskId?: string;
  note?: string;
  partial?: boolean;
  state: "present" | "changed" | "missing";
  onBranch: boolean;
  behind: number;
};
export type Holdings = {
  rootPath: string;
  name: string;
  remotes: { name: string; url: string }[];
  artifacts: Artifact[];
  versions?: ArtifactVersion[];
  markdown: string;
};
export type Snapshot = {
  catalog: {
    groups: { id: string; name: string; sort: number }[];
    projects: { id: string; name: string; rootPath: string; groupId?: string }[];
    latticeHome: string;
    settings?: AppSettings;
  };
  projects: Project[];
  maps: RepoMap[];
  holdings: Holdings[];
  requests?: (ConsentRequest & { rootPath: string })[];
  ledgerTail?: { rootPath: string; lines: string[] }[];
  drift?: { rootPath: string; items: Drift[] }[];
  occupancy?: { rootPath: string; rows: Occupancy[] }[];
};

export type EvidenceCell = {
  id: "tree" | "diff" | "blast" | "handoff" | "filled" | "wiki";
  label: string;
  lit: boolean;
  skipped?: boolean;
};

export type GraphNodeKind = "repo" | "branch" | "worktree" | "artifact" | "task";
export type GraphEdgeKind = "ref" | "checkout" | "open" | "build" | "pin";
export type ProcessStep = "repo" | "branch" | "worktree" | "artifact";
export type GraphNode = {
  id: string;
  kind: GraphNodeKind;
  label: string;
  branch?: string;
  path?: string;
  sha12?: string;
  taskId?: string;
  artifactId?: string;
};
export type GraphEdge = {
  id: string;
  kind: GraphEdgeKind;
  from: string;
  to: string;
  sha12?: string;
  offBranch?: boolean;
  behind?: number;
};
export type ProcessGraph = {
  rootPath: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
};
export type Occupancy = {
  taskId: string;
  agent: string;
  branch: string;
  sha12: string;
  ahead: number;
  behind: number;
  files: number;
  blast: "ok" | "warning" | "blocked" | "none";
  doing: string;
  doingFrom?: "pulse" | "inflight" | "derived";
  pulse?: { remainMin?: number; cite: { kind: "path" | "sha"; value: string }; writtenAt: string };
  evidence: EvidenceCell[];
  lit: number;
  denom: number;
  idleMs: number;
  pending: boolean;
  hygiene: HygieneKind[];
  frozen: boolean;
  wikiBlocked?: boolean;
};

export type Consent = "never" | "ask" | "allow";
export type PolicyPreset = "locked" | "balanced" | "open" | "custom";
export type AgentAction =
  | "createTask"
  | "markDone"
  | "escalateFrozen"
  | "createBranch"
  | "plantBranch"
  | "archiveWorktree"
  | "archiveWorktreeForce"
  | "deleteBranch"
  | "editCharter"
  | "ingestRaw"
  | "lintFix";
export type AppSkin = "lean" | "forge";
export type ForgeDecor = "off" | "on";
export type AppSettings = {
  openIn: "cursor" | "vscode" | "finder" | "terminal" | "none";
  worktreesRoot: string;
  defaultPreset: PolicyPreset;
  confirmDestructive: boolean;
  motion: "system" | "off";
  skin: AppSkin;
  forgeDecor: ForgeDecor;
};
export type Policy = {
  version: 1;
  preset: PolicyPreset;
  agentMay: Record<AgentAction, Consent>;
  wiki: {
    ingestHandoffs: "always" | "onDone";
    agentWrites: { concepts: boolean; sources: boolean; syntheses: boolean };
    gate: "off" | "warn" | "block";
  };
  declared: { push: Consent; publishArtifacts: Consent };
  updatedAt: string;
  updatedBy: "human";
};
export type ConsentRequest = {
  id: string;
  action: AgentAction;
  actor: "agent";
  agent: string;
  params: Record<string, unknown>;
  reason: string;
  createdAt: string;
  status: "pending" | "approved" | "denied" | "executed" | "failed";
  decidedAt?: string;
  note?: string;
  error?: string;
  rootPath?: string;
};
export type VaultNote = { path: string; title: string; type: string; tags: string[]; body: string; layer?: string };
export type WikiHitField = "title" | "type" | "tags" | "path" | "body";
export type WikiHit = { field: WikiHitField; snippet: string };
export type WikiPage = {
  path: string;
  title: string;
  type: string;
  tags: string[];
  summary: string;
  body: string;
  links: string[];
  layer: "raw" | "wiki";
  compiled: boolean;
  hit?: WikiHit;
};
export type WikiLint = {
  pages: number;
  issues: { kind: string; path: string; detail: string; fixable: boolean }[];
  ok: boolean;
};
export type SourceEntry = { name: string; path: string; kind: "file" | "dir" };
export type BlastReport = {
  verdict: "ok" | "warning" | "blocked";
  findings: { path: string; verdict: string; reason: string }[];
  files: string[];
  charterVersion: number;
};

const json = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-Workzoon-Actor": "human",
      ...(init?.headers || {}),
    },
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || response.statusText);
  return body as T;
};

export const api = {
  snapshot: () => json<Snapshot>("/api/snapshot"),
  init: (rootPath: string, name: string, groupId: string) =>
    json<Project>("/api/init", { method: "POST", body: JSON.stringify({ rootPath, name, groupId }) }),
  createTask: (
    rootPath: string,
    title: string,
    allowedPaths: string[],
    allowFrozenTouch: boolean,
    escalationReason?: string,
    extra?: { intent?: "feat" | "spike" | "hotfix"; baseBranch?: string },
  ) =>
    json<{ project: Project; task: Task }>("/api/tasks", {
      method: "POST",
      body: JSON.stringify({
        rootPath,
        title,
        allowedPaths,
        allowFrozenTouch,
        escalationReason,
        intent: extra?.intent,
        baseBranch: extra?.baseBranch,
      }),
    }),
  openTree: (rootPath: string, taskId: string) =>
    json<{ project: Project; worktree: Worktree }>("/api/worktrees/open", {
      method: "POST",
      body: JSON.stringify({ rootPath, taskId }),
    }),
  pulse: (
    rootPath: string,
    taskId: string,
    doing: string,
    cite: { kind: "path" | "sha"; value: string },
    remainMin?: number,
  ) =>
    json<{ pulse: { doing: string; remainMin?: number } }>("/api/pulse", {
      method: "POST",
      body: JSON.stringify({ rootPath, taskId, doing, cite, remainMin }),
    }),
  clearPulse: (rootPath: string, taskId: string) =>
    json<Project>("/api/pulse/clear", { method: "POST", body: JSON.stringify({ rootPath, taskId }) }),
  blast: (rootPath: string, taskId: string) =>
    json<BlastReport>("/api/blast", { method: "POST", body: JSON.stringify({ rootPath, taskId }) }),
  handoff: (rootPath: string, taskId: string, decisions: string, nextAction: string) =>
    json<{ markdown: string; prompt: string; blast: BlastReport; project: Project }>("/api/handoff", {
      method: "POST",
      body: JSON.stringify({ rootPath, taskId, decisions, nextAction }),
    }),
  readHandoff: (rootPath: string, taskId: string) =>
    json<{ markdown: string; valid: boolean; path: string; prompt: string }>(
      `/api/handoff?root=${encodeURIComponent(rootPath)}&task=${encodeURIComponent(taskId)}`,
    ),
  done: (rootPath: string, taskId: string) =>
    json<Project>("/api/done", { method: "POST", body: JSON.stringify({ rootPath, taskId }) }),
  vault: (rootPath: string, q = "") =>
    json<VaultNote[]>(`/api/vault?root=${encodeURIComponent(rootPath)}&q=${encodeURIComponent(q)}`),
  wiki: (rootPath: string, q = "") =>
    json<WikiPage[]>(`/api/wiki?root=${encodeURIComponent(rootPath)}&q=${encodeURIComponent(q)}`),
  wikiPage: (rootPath: string, path: string) =>
    json<WikiPage>(`/api/wiki/page?root=${encodeURIComponent(rootPath)}&path=${encodeURIComponent(path)}`),
  wikiLint: (rootPath: string, fix = false) =>
    json<WikiLint>(`/api/wiki/lint?root=${encodeURIComponent(rootPath)}&fix=${fix ? "1" : "0"}`),
  ingest: (rootPath: string, title: string, body: string) =>
    json<{ path: string }>("/api/wiki/ingest", {
      method: "POST",
      body: JSON.stringify({ rootPath, title, body, topic: "sources" }),
    }),
  wikiWrite: (rootPath: string, bucket: "concepts" | "sources" | "syntheses", title: string, body: string) =>
    json<{ path: string }>("/api/wiki/write", {
      method: "POST",
      body: JSON.stringify({ rootPath, bucket, title, body }),
    }),
  files: (rootPath: string, path?: string) =>
    json<SourceEntry[]>(`/api/files?root=${encodeURIComponent(rootPath)}&path=${encodeURIComponent(path || rootPath)}`),
  plant: (rootPath: string, branch: string) =>
    json<{ path: string; planted: boolean }>("/api/worktrees/plant", {
      method: "POST",
      body: JSON.stringify({ rootPath, branch }),
    }),
  archive: (rootPath: string, taskId: string, confirm?: string) =>
    json<Project>("/api/worktrees/archive", {
      method: "POST",
      body: JSON.stringify({ rootPath, taskId, confirm }),
    }),
  settings: () => json<AppSettings>("/api/settings"),
  updateSettings: (partial: Partial<AppSettings>) =>
    json<AppSettings>("/api/settings", { method: "POST", body: JSON.stringify(partial) }),
  policy: (rootPath: string) => json<Policy>(`/api/policy?root=${encodeURIComponent(rootPath)}`),
  updatePolicy: (
    rootPath: string,
    policy: {
      preset?: PolicyPreset;
      agentMay?: Partial<Record<AgentAction, Consent>>;
      wiki?: Policy["wiki"];
      declared?: Policy["declared"];
    },
  ) =>
    json<Policy>("/api/policy", { method: "POST", body: JSON.stringify({ rootPath, ...policy }) }),
  requests: (rootPath: string) => json<ConsentRequest[]>(`/api/requests?root=${encodeURIComponent(rootPath)}`),
  decide: (rootPath: string, id: string, approve: boolean, note?: string) =>
    json<ConsentRequest>("/api/requests/decide", {
      method: "POST",
      body: JSON.stringify({ rootPath, id, approve, note }),
    }),
  deleteBranch: (rootPath: string, branch: string, force = false, confirm?: string) =>
    json<Project>("/api/branches/delete", {
      method: "POST",
      body: JSON.stringify({ rootPath, branch, force, confirm }),
    }),
  sync: (rootPath: string) =>
    json<{ project: Project; drift: Drift[] }>("/api/agents/sync", {
      method: "POST",
      body: JSON.stringify({ rootPath }),
    }),
  artifacts: (rootPath: string) =>
    json<{ artifacts: Artifact[]; versions: ArtifactVersion[] }>(
      `/api/artifacts?root=${encodeURIComponent(rootPath)}`,
    ),
  pin: (rootPath: string, name: string, checkout?: string, note?: string) =>
    json<{ version: ArtifactVersion; created: boolean; holdings: Holdings }>("/api/artifacts/pin", {
      method: "POST",
      body: JSON.stringify({ rootPath, name, checkout, note }),
    }),
  unpin: (rootPath: string, id: string) =>
    json<{ version: ArtifactVersion; holdings: Holdings }>("/api/artifacts/unpin", {
      method: "POST",
      body: JSON.stringify({ rootPath, id }),
    }),
  graph: (rootPath: string) =>
    json<ProcessGraph>(`/api/graph?root=${encodeURIComponent(rootPath)}`),
};
