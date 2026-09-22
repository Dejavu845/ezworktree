import { nowIso } from "./ids.ts";
import type { AgentAction, Caller, Consent, Policy, PolicyPreset } from "./types.ts";

export const DESTRUCTIVE: AgentAction[] = [
  "deleteBranch",
  "archiveWorktreeForce",
  "editCharter",
  "escalateFrozen",
];

export const ALWAYS_FORBIDDEN = [
  "addRemote",
  "forcePush",
  "deleteArtifacts",
  "editRaw",
  "editEntities",
  "editPolicy",
] as const;

export const ACTIONS: {
  id: AgentAction;
  label: string;
  hint: string;
  destructive: boolean;
  group: "任务" | "分支" | "宪章" | "百科";
}[] = [
  { id: "createTask", label: "开新任务", hint: "Agent 能否自己建任务卡", destructive: false, group: "任务" },
  { id: "markDone", label: "标记任务完成", hint: "写完交接才能完成。百科还拦着就先把原文写进百科", destructive: false, group: "任务" },
  { id: "escalateFrozen", label: "给自己的任务开「动冻层」", hint: "破例改冻层，伤筋动骨", destructive: true, group: "任务" },
  { id: "createBranch", label: "为任务建分支和 worktree", hint: "一张卡一棵树时会建功能 / 试探 / 热修分支", destructive: false, group: "分支" },
  { id: "plantBranch", label: "把已有分支开成 worktree", hint: "给还没有目录的分支种树", destructive: false, group: "分支" },
  { id: "archiveWorktree", label: "归档干净的 worktree（留分支）", hint: "收起树，默认留着分支", destructive: false, group: "分支" },
  { id: "archiveWorktreeForce", label: "丢掉未保存的改动并归档", hint: "强制收起还没存好的树", destructive: true, group: "分支" },
  { id: "deleteBranch", label: "删除分支", hint: "不删主干和你正打开的。要先归档 worktree", destructive: true, group: "分支" },
  { id: "editCharter", label: "修改宪章", hint: "Agent 即使获批也只能改干活规矩，或加一层", destructive: true, group: "宪章" },
  { id: "ingestRaw", label: "收入原文", hint: "把原文收进来。这个不能关死", destructive: false, group: "百科" },
  { id: "lintFix", label: "检查时补目录", hint: "检查时自动补上目录里缺的行", destructive: false, group: "百科" },
];

export function actionLabel(id: string): string {
  return ACTIONS.find((item) => item.id === id)?.label || id;
}

type PolicyBody = Pick<Policy, "agentMay" | "wiki" | "declared">;

const WIKI_WRITES = { concepts: true, sources: true, syntheses: true };

export const PRESETS: Record<Exclude<PolicyPreset, "custom">, PolicyBody> = {
  locked: {
    agentMay: {
      createTask: "ask",
      markDone: "ask",
      escalateFrozen: "never",
      createBranch: "ask",
      plantBranch: "ask",
      archiveWorktree: "ask",
      archiveWorktreeForce: "never",
      deleteBranch: "never",
      editCharter: "never",
      ingestRaw: "allow",
      lintFix: "ask",
    },
    wiki: { ingestHandoffs: "always", agentWrites: { ...WIKI_WRITES }, gate: "block" },
    declared: { push: "never", publishArtifacts: "never" },
  },
  balanced: {
    agentMay: {
      createTask: "allow",
      markDone: "ask",
      escalateFrozen: "ask",
      createBranch: "allow",
      plantBranch: "allow",
      archiveWorktree: "ask",
      archiveWorktreeForce: "never",
      deleteBranch: "never",
      editCharter: "never",
      ingestRaw: "allow",
      lintFix: "allow",
    },
    wiki: { ingestHandoffs: "always", agentWrites: { ...WIKI_WRITES }, gate: "warn" },
    declared: { push: "ask", publishArtifacts: "never" },
  },
  open: {
    agentMay: {
      createTask: "allow",
      markDone: "allow",
      escalateFrozen: "ask",
      createBranch: "allow",
      plantBranch: "allow",
      archiveWorktree: "allow",
      archiveWorktreeForce: "ask",
      deleteBranch: "ask",
      editCharter: "ask",
      ingestRaw: "allow",
      lintFix: "allow",
    },
    wiki: { ingestHandoffs: "always", agentWrites: { ...WIKI_WRITES }, gate: "warn" },
    declared: { push: "allow", publishArtifacts: "ask" },
  },
};

export class PolicyError extends Error {
  code: "ask" | "never";
  action: AgentAction;
  requestId?: string;
  constructor(code: "ask" | "never", action: AgentAction, message?: string, requestId?: string) {
    const label = ACTIONS.find((item) => item.id === action)?.label || action;
    super(
      message ||
        (code === "never"
          ? `授权禁止 Agent 执行「${label}」。`
          : `授权要求人同意才能「${label}」。`),
    );
    this.name = "PolicyError";
    this.code = code;
    this.action = action;
    this.requestId = requestId;
  }
}

export function defaultPolicy(preset: PolicyPreset = "balanced"): Policy {
  const key = preset === "custom" ? "balanced" : preset;
  const body = PRESETS[key];
  return {
    version: 1,
    preset,
    agentMay: { ...body.agentMay },
    wiki: {
      ingestHandoffs: body.wiki.ingestHandoffs,
      agentWrites: { ...body.wiki.agentWrites },
      gate: body.wiki.gate,
    },
    declared: { ...body.declared },
    updatedAt: nowIso(),
    updatedBy: "human",
  };
}

function sameBody(a: PolicyBody, b: PolicyBody): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function templateOf(preset: PolicyPreset): PolicyBody {
  return PRESETS[preset === "custom" ? "balanced" : preset];
}

export function mergePolicy(partial?: Partial<Policy> | null): Policy {
  const requested = partial?.preset || "balanced";
  const base = defaultPolicy(requested);
  const agentMay = { ...base.agentMay, ...(partial?.agentMay || {}) };
  for (const action of DESTRUCTIVE) {
    if (agentMay[action] === "allow") agentMay[action] = "ask";
  }
  if (agentMay.ingestRaw === "never") agentMay.ingestRaw = "ask";
  const agentWrites = {
    ...base.wiki.agentWrites,
    ...(partial?.wiki?.agentWrites || {}),
  };
  let gate = partial?.wiki?.gate || base.wiki.gate;
  if (!agentWrites.concepts) gate = "off";
  const wiki = {
    ingestHandoffs: partial?.wiki?.ingestHandoffs || base.wiki.ingestHandoffs,
    agentWrites,
    gate,
  };
  const declared = { ...base.declared, ...(partial?.declared || {}) };
  const body: PolicyBody = { agentMay, wiki, declared };
  let preset: PolicyPreset = requested;
  if (requested !== "custom" && !sameBody(body, templateOf(requested))) {
    preset = "custom";
  }
  return {
    version: 1,
    preset,
    agentMay,
    wiki,
    declared,
    updatedAt: partial?.updatedAt || base.updatedAt,
    updatedBy: "human",
  };
}

export function assertAllowed(policy: Policy, action: AgentAction, caller: Caller = { actor: "agent" }): void {
  if (caller.actor === "human") return;
  const mode: Consent = mergePolicy(policy).agentMay[action];
  if (mode === "allow") return;
  if (mode === "ask" && caller.consent) return;
  throw new PolicyError(mode === "never" ? "never" : "ask", action);
}

export function renderPolicyMarkdown(policy: Policy): string {
  const p = mergePolicy(policy);
  const rows = ACTIONS.map(
    (item) => `| ${item.label} | \`${item.id}\` | ${p.agentMay[item.id]} | ${item.destructive ? "是" : "否"} |`,
  ).join("\n");
  return `# Agent Workzoon policy

<!-- workzoon:policy -->

Preset: **${p.preset}**

Wiki: ingest handoffs \`${p.wiki.ingestHandoffs}\` · gate \`${p.wiki.gate}\` · agent writes concepts=${p.wiki.agentWrites.concepts} sources=${p.wiki.agentWrites.sources} syntheses=${p.wiki.agentWrites.syntheses}

Declared: push \`${p.declared.push}\` · publish artifacts \`${p.declared.publishArtifacts}\`

| 动作 | id | Agent | 破坏 |
|---|---|---|---|
${rows}

never = 引擎拒绝 · ask = 要人确认 · allow = Agent 可直接做

破坏性动作最高只能到需确认。ingestRaw 不能 never。
完成前必须维护百科并 lint。
`;
}

export function policyFingerprint(policy?: Partial<Policy> | null): string {
  if (!policy) return "";
  return JSON.stringify({
    version: policy.version || 0,
    preset: policy.preset || "",
    agentMay: policy.agentMay || {},
    wiki: policy.wiki || {},
    declared: policy.declared || {},
  });
}
