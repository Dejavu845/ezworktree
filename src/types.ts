export type TaskStatus = "backlog" | "active" | "review" | "done" | "blocked";
export type TaskIntent = "feat" | "spike" | "hotfix";
export type WorktreeStatus = "active" | "review" | "archived";
export type BlastVerdict = "ok" | "warning" | "blocked";
export type HygieneKind = "merged" | "stale" | "no-handoff";
export type DriftKind = "edited" | "missing" | "stale";
export type Drift = { file: "AGENTS.md"; kind: DriftKind; recorded?: string; actual?: string };

export type Layer = {
  id: string;
  name: string;
  paths: string[];
  frozen: boolean;
};

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
  by: Actor;
  agent?: string;
  at: string;
  requestId?: string;
};

export type Task = {
  id: string;
  slug: string;
  title: string;
  status: TaskStatus;
  intent: TaskIntent;
  baseBranch: string;
  agent: string;
  allowedPaths: string[];
  forbiddenPaths: string[];
  layerIds: string[];
  allowFrozenTouch: boolean;
  escalation?: Escalation;
  worktreeId?: string;
  handoffId?: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export type Worktree = {
  id: string;
  taskId: string;
  path: string;
  branch: string;
  baseBranch: string;
  status: WorktreeStatus;
  createdAt: string;
};

export type Handoff = {
  id: string;
  taskId: string;
  fromAgent: string;
  toAgent: string;
  path: string;
  updatedAt: string;
};

export type Project = {
  id: string;
  name: string;
  /** Hydrated on load from the checkout that contains `.lattice/`. Not written to `project.json`. */
  rootPath: string;
  groupId?: string;
  baseBranch: string;
  charter: Charter;
  policy: Policy;
  tasks: Task[];
  worktrees: Worktree[];
  handoffs: Handoff[];
  updatedAt: string;
};

export type Group = {
  id: string;
  name: string;
  sort: number;
};

export type Catalog = {
  groups: Group[];
  projects: { id: string; name: string; rootPath: string; groupId?: string }[];
  latticeHome: string;
  settings: AppSettings;
};

export type Consent = "never" | "ask" | "allow";
export type PolicyPreset = "locked" | "balanced" | "open" | "custom";
export type Actor = "human" | "agent";

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

export type Caller = { actor: Actor; agent?: string; consent?: boolean };

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
  decidedBy?: "human";
  note?: string;
  error?: string;
};

export type BlastFinding = {
  path: string;
  verdict: BlastVerdict;
  reason: string;
};

export type BlastReport = {
  verdict: BlastVerdict;
  findings: BlastFinding[];
  files: string[];
  charterVersion: number;
};

export type VaultNote = {
  path: string;
  title: string;
  type: string;
  tags: string[];
  body: string;
  links: string[];
  layer?: "raw" | "wiki" | "vault";
};

export type BranchRef = {
  name: string;
  sha: string;
  isHead: boolean;
  isRemote: boolean;
  worktreePath: string;
  subject: string;
  updatedAt: string;
};

export type LiveWorktree = {
  path: string;
  branch: string;
  sha: string;
  detached: boolean;
  isPrimary: boolean;
};

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
  taskStatus?: TaskStatus;
  baseBranch?: string;
  updatedAt: string;
  merged: boolean;
  hygiene: HygieneKind[];
  undeclared: boolean;
};

export type SourceEntry = {
  name: string;
  path: string;
  kind: "file" | "dir";
};

export type RepoMap = {
  rootPath: string;
  name: string;
  baseBranch: string;
  currentBranch: string;
  branches: BranchRef[];
  worktrees: LiveWorktree[];
  lanes: RepoLane[];
};

export type Remote = {
  name: string;
  url: string;
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
  pinnedBy: { actor: Actor; agent?: string };
  taskId?: string;
  note?: string;
  partial?: boolean;
};

export type ArtifactVersionView = ArtifactVersion & {
  state: "present" | "changed" | "missing";
  onBranch: boolean;
  behind: number;
};

export type Holdings = {
  rootPath: string;
  name: string;
  remotes: Remote[];
  map: RepoMap;
  artifacts: Artifact[];
  versions: ArtifactVersionView[];
  markdown: string;
};

export type WikiHitField = "title" | "type" | "tags" | "path" | "body";

export type WikiHit = {
  field: WikiHitField;
  snippet: string;
};

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

export type WikiBucket = "concepts" | "sources" | "syntheses";

export type WikiLintIssue = {
  kind:
    | "index-missing"
    | "index-stale"
    | "broken-link"
    | "orphan"
    | "raw-escape"
    | "raw-uncompiled"
    | "entity-hand-edit"
    | "write-forbidden";
  path: string;
  detail: string;
  fixable: boolean;
};

export type WikiLint = {
  pages: number;
  issues: WikiLintIssue[];
  ok: boolean;
  byKind?: Record<string, number>;
};

export type EvidenceCellId = "tree" | "diff" | "blast" | "handoff" | "filled" | "wiki";

export type EvidenceCell = {
  id: EvidenceCellId;
  label: string;
  lit: boolean;
  skipped?: boolean;
};

export type PulseCite = { kind: "path" | "sha"; value: string };

export type Pulse = {
  v: 1;
  taskId: string;
  agent: string;
  doing: string;
  remainMin?: number;
  cite: PulseCite;
  writtenAt: string;
};

export type Occupancy = {
  taskId: string;
  agent: string;
  branch: string;
  sha12: string;
  ahead: number;
  behind: number;
  files: number;
  blast: BlastVerdict | "none";
  doing: string;
  doingFrom: "pulse" | "inflight" | "derived";
  pulse?: { remainMin?: number; cite: PulseCite; writtenAt: string };
  evidence: EvidenceCell[];
  lit: number;
  denom: number;
  idleMs: number;
  pending: boolean;
  hygiene: HygieneKind[];
  frozen: boolean;
  wikiBlocked?: boolean;
};

export type CreateTaskInput = {
  title: string;
  slug?: string;
  agent?: string;
  intent?: TaskIntent | string;
  baseBranch?: string;
  allowedPaths?: string[];
  forbiddenPaths?: string[];
  layerIds?: string[];
  allowFrozenTouch?: boolean;
  escalationReason?: string;
  notes?: string;
};

export type GraphNodeKind = "repo" | "branch" | "worktree" | "artifact" | "task";
export type GraphEdgeKind = "ref" | "checkout" | "open" | "build" | "pin";

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

export type ProcessStep = "repo" | "branch" | "worktree" | "artifact";

export type ProcessStripView = {
  repoLabel: string;
  branchLabel: string;
  treeLabel: string;
  buildLabel: string;
  branches: number;
  worktrees: number;
  artifacts: number;
};
