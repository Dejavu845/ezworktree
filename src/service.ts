import { existsSync, mkdirSync, rmSync } from "node:fs";
import { basename, relative } from "node:path";
import { checkBlast } from "./blast.ts";
import { applyCharterVersion } from "./charter.ts";
import { ESCALATION_ERROR, normalizeEscalationReason } from "./escalation.ts";
import {
  addWorktree,
  applyWorktreeInclude,
  changedFiles,
  changedOnBranch,
  currentBranch,
  defaultBranch,
  deleteBranch as gitDeleteBranch,
  isGitRepo,
  isMerged,
  listLiveWorktrees,
  removeWorktree,
} from "./git.ts";
import {
  writeHandoff,
  isAlignedHandoff,
  isValidHandoff,
  liveHandoffRef,
  readHandoff,
  renderHandoff,
  resumePrompt,
  handoffPath,
} from "./handoff.ts";
import { detectDrift } from "./drift.ts";
import {
  excludeGovernance,
  injectProjectFiles,
  publishTaskFilesToBranch,
  syncGovernanceToWorktree,
  writeTaskCard,
} from "./inject.ts";
import { nowIso, slugify, uuid } from "./ids.ts";
import { appendLedger, ledgerTail, readLedger } from "./ledger.ts";
import { ACTIONS, assertAllowed, defaultPolicy, mergePolicy, PolicyError } from "./policy.ts";
import { assertAgentDeclared } from "./topology.ts";
import {
  createRequest,
  listPendingRequests,
  listRequests,
  loadRequest,
  requestRejectReason,
  saveRequest,
} from "./requests.ts";
import { assertTypedConfirm } from "./confirm.ts";
import { mergeAppSettings } from "./settings.ts";
import {
  loadCatalog,
  loadProject,
  projectFile,
  saveCatalog,
  saveProject,
  worktreeRoot,
} from "./store.ts";
import { pinArtifact as writeArtifactPin, unpinArtifact as removeArtifactPin } from "./artifacts.ts";
import { plannedBranch, parseIntent, resolveTaskBase, taskMissingRejectReason, taskRejectReason } from "./lane.ts";
import { handoffFilled, occupancyForProject } from "./occupancy.ts";
import { guardStaged as runGuardStaged, type GuardResult } from "./guard.ts";
import { buildProcessGraph } from "./graph.ts";
import {
  authorizePulseClear,
  authorizePulseWrite,
  blastFileSet,
  citeRejectReason,
  citeValid,
  clearPulseRecord,
  normalizeCite,
  parsePulse,
  writePulseRecord,
} from "./pulse.ts";
import { collectHoldings } from "./holdings.ts";
import { listSource } from "./map.ts";
import { injectContext, listNotes, searchNotes, seedVault } from "./vault.ts";
import {
  compileEntityWiki,
  ingestHandoffRaw,
  ingestRaw,
  lintWiki,
  listWikiPages,
  readWikiPage,
  searchWiki,
  seedWiki,
  writeWikiPage,
} from "./wiki.ts";
import type {
  AppSettings,
  BlastReport,
  Caller,
  Catalog,
  Charter,
  ConsentRequest,
  Artifact,
  ArtifactVersion,
  ArtifactVersionView,
  CreateTaskInput,
  Drift,
  Holdings,
  Occupancy,
  Policy,
  ProcessGraph,
  Project,
  Pulse,
  RepoMap,
  SourceEntry,
  Task,
  VaultNote,
  WikiLint,
  WikiPage,
  Worktree,
} from "./types.ts";

const AGENT: Caller = { actor: "agent" };

function asCaller(caller?: Caller): Caller {
  return caller?.actor === "human" ? caller : { actor: "agent", agent: caller?.agent, consent: caller?.consent };
}

function touch(project: Project): Project {
  project.updatedAt = nowIso();
  saveProject(project);
  return project;
}

function requireProject(rootPath: string): Project {
  const project = loadProject(rootPath);
  if (!project) throw new Error(projectRejectReason(rootPath));
  project.policy = mergePolicy(project.policy);
  for (const task of project.tasks) {
    if (!task.intent) task.intent = "feat";
    if (!task.baseBranch) task.baseBranch = project.baseBranch;
  }
  return project;
}

function requireTask(project: Project, taskId: string): Task {
  const task = project.tasks.find((item) => item.id === taskId);
  if (!task) throw new Error(taskMissingRejectReason(taskId));
  return task;
}

function ledger(
  project: Project,
  caller: Caller,
  action: string,
  target: string,
  outcome = "ok",
  requestId?: string,
): void {
  appendLedger(project, {
    actor: caller.actor,
    agent: caller.agent,
    action,
    target,
    outcome,
    requestId,
  });
}

function guard(
  project: Project,
  action: Parameters<typeof assertAllowed>[1],
  caller: Caller,
  params: Record<string, unknown>,
  reason?: string,
): void {
  try {
    assertAllowed(project.policy, action, caller);
  } catch (error) {
    if (error instanceof PolicyError && error.code === "ask" && caller.actor === "agent" && !caller.consent) {
      const label = ACTIONS.find((item) => item.id === action)?.label || action;
      const request = createRequest(project, {
        action,
        agent: caller.agent || "agent",
        params,
        reason: reason || `Agent 请求执行「${label}」`,
      });
      ledger(project, caller, action, String(params.taskId || params.branch || params.title || action), "pending", request.id);
      throw new PolicyError("ask", action, `${error.message} 请到宪章页批准。`, request.id);
    }
    throw error;
  }
}

export function listSnapshot(): { catalog: Catalog; projects: Project[] } {
  const catalog = loadCatalog();
  const projects = catalog.projects
    .map((entry) => loadProject(entry.rootPath))
    .filter((item): item is Project => Boolean(item));
  return { catalog, projects };
}

export function defaultCharter(name: string) {
  return {
    version: 1,
    purpose: `${name} 按一份固定宪章开发。助手跟着分层走，不把前面的工作改得认不出来。`,
    architecture: "宪章、独立检出和交接文件是控制面。界面不直接改 git。",
    conventions: [
      "一张任务卡、一棵检出、一条分支。先建卡，再创建 worktree。",
      "完成之前先写交接：决定和下一步都要填。",
      "先读百科目录。原文收进来之后不要再改。",
      "不要编造专辑或歌曲，也不要提交密钥。",
    ],
    doNotTouch: [".env", ".env.*", "node_modules/**", "public/music/netease/**"],
    layers: [
      { id: "foundation", name: "Foundation", paths: ["package.json", "tsconfig.json", "next.config.mjs"], frozen: true },
      { id: "app", name: "App", paths: ["app/**", "components/**", "lib/**"], frozen: false },
      { id: "content", name: "Content", paths: ["messages/**", "content/**", "public/**"], frozen: false },
    ],
  };
}

export function initRejectReason(rootPath: string): string {
  return `「${rootPath}」还不是代码仓库。请给仓库最外面那一层的路径。`;
}

export function projectRejectReason(rootPath: string): string {
  return `「${rootPath}」还没有工区。先点左下登记仓。`;
}

export function plantRejectReason(dest: string): string {
  return `「${dest}」已经有目录了。换个任务名，或先清掉这棵树。`;
}

export function plantNameRejectReason(): string {
  return "还没写要开出来的分支。";
}

export function pinNameRejectReason(): string {
  return "还没写要钉的产物名。";
}

export type CharterRejectKind = "scope" | "touch" | "remove" | "unfreeze";

export function charterRejectReason(kind: CharterRejectKind): string {
  if (kind === "scope") return "Agent 只能改干活的规矩，或加一层。这项目要做什么、怎么搭，请你来写。";
  if (kind === "touch") return "Agent 不能拿掉「不能碰」的文件。要改这份清单，请你来。";
  if (kind === "remove") return "Agent 不能删掉已有的层。只能往上加。";
  return "Agent 不能把已经冻住的层解开。";
}

export type HumanRejectKind = "pin" | "unpin" | "sync" | "policy" | "decide";

export function humanRejectReason(kind: HumanRejectKind): string {
  if (kind === "pin") return "只有人能钉产物。";
  if (kind === "unpin") return "只有人能卸钉。";
  if (kind === "sync") return "只有人能把说明文件同步回去。";
  if (kind === "policy") return "只有人能改谁能做什么。";
  return "只有人能批请求。";
}

export function pinUnpinRejectReason(kind: "empty" | "missing", id = ""): string {
  if (kind === "empty") return "还没写要卸的钉。";
  return `找不到钉「${id}」。`;
}

export function archiveRejectReason(): string {
  return "这张卡还没有自己的目录。先到对照创建 worktree，或换一张有树的卡。";
}

export type DeleteRejectKind = "empty" | "base" | "live" | "head" | "unmerged-agent" | "unmerged";

export function deleteRejectReason(kind: DeleteRejectKind, detail: { branch?: string; base?: string } = {}): string {
  const branch = detail.branch || "";
  if (kind === "empty") return "还没写要删的分支。";
  if (kind === "base") return `「${branch}」是基线，不能删。`;
  if (kind === "live") return `「${branch}」还有活树。先到范围页归档 worktree，再删分支。`;
  if (kind === "head") return `「${branch}」正是你现在打开的。先换到别处再删。`;
  if (kind === "unmerged-agent") return "还没并回去的分支，只能由人强制删除。";
  return `「${branch}」还没并回 ${detail.base}。先并回去再删。`;
}

export function deleteLiveRejectReason(branch: string): string {
  return deleteRejectReason("live", { branch });
}

export function initProject(rootPath: string, name?: string, groupId = "studio"): Project {
  if (!isGitRepo(rootPath)) {
    throw new Error(initRejectReason(rootPath));
  }
  const existing = loadProject(rootPath);
  if (existing) {
    registerCatalog(existing, groupId);
    return existing;
  }

  const catalog = loadCatalog();
  const project: Project = {
    id: uuid(),
    name: name || basename(rootPath),
    rootPath,
    groupId,
    baseBranch: defaultBranch(rootPath),
    charter: defaultCharter(name || basename(rootPath)),
    policy: defaultPolicy(catalog.settings.defaultPreset),
    tasks: [],
    worktrees: [],
    handoffs: [],
    updatedAt: nowIso(),
  };
  saveProject(project);
  seedVault(project);
  seedWiki(project);
  compileEntityWiki(project);
  injectProjectFiles(project);
  registerCatalog(project, groupId);
  ledger(project, { actor: "human" }, "init", project.name);
  return project;
}

function registerCatalog(project: Project, groupId?: string): void {
  const catalog = loadCatalog();
  const found = catalog.projects.find((item) => item.id === project.id || item.rootPath === project.rootPath);
  const entry = {
    id: project.id,
    name: project.name,
    rootPath: project.rootPath,
    groupId: groupId || project.groupId,
  };
  if (found) Object.assign(found, entry);
  else catalog.projects.push(entry);
  saveCatalog(catalog);
}

function constrainAgentCharter(prev: Charter, next: Charter): Charter {
  if (next.purpose !== prev.purpose || next.architecture !== prev.architecture) {
    throw new Error(charterRejectReason("scope"));
  }
  for (const item of prev.doNotTouch) {
    if (!next.doNotTouch.includes(item)) {
      throw new Error(charterRejectReason("touch"));
    }
  }
  const prevIds = new Set(prev.layers.map((layer) => layer.id));
  for (const layer of prev.layers) {
    const found = next.layers.find((item) => item.id === layer.id);
    if (!found) throw new Error(charterRejectReason("remove"));
    if (layer.frozen && !found.frozen) throw new Error(charterRejectReason("unfreeze"));
  }
  const added = next.layers.filter((layer) => !prevIds.has(layer.id));
  return {
    version: prev.version,
    purpose: prev.purpose,
    architecture: prev.architecture,
    conventions: next.conventions,
    doNotTouch: next.doNotTouch,
    layers: [...prev.layers, ...added],
  };
}

export function updateCharter(rootPath: string, charter: Project["charter"], caller: Caller = AGENT): Project {
  const who = asCaller(caller);
  const project = requireProject(rootPath);
  guard(project, "editCharter", who, { charter });
  const incoming = who.actor === "agent" ? constrainAgentCharter(project.charter, charter) : charter;
  project.charter = applyCharterVersion(project.charter, incoming);
  injectProjectFiles(project);
  touch(project);
  ledger(project, who, "editCharter", "charter");
  return project;
}

export function createTask(
  rootPath: string,
  input: CreateTaskInput,
  caller: Caller = AGENT,
  origin?: { requestId?: string; agent?: string },
): { project: Project; task: Task } {
  const who = asCaller(caller);
  const project = requireProject(rootPath);
  const wants = Boolean(input.allowFrozenTouch);
  let reason: string | undefined;
  if (wants) {
    const normalized = normalizeEscalationReason(input.escalationReason);
    if (!normalized) throw new Error(ESCALATION_ERROR);
    reason = normalized;
  }
  const params: Record<string, unknown> = { ...input, ...(reason ? { escalationReason: reason } : {}) };
  if (who.actor === "agent" && wants) {
    guard(project, "escalateFrozen", who, params, reason);
  }
  guard(project, "createTask", who, params, reason);
  const slug = uniqueSlug(project, slugify(input.slug || input.title));
  const intent = parseIntent(input.intent);
  const baseBranch = resolveTaskBase(project, input.baseBranch);
  if (plannedBranch({ slug, intent }) === baseBranch) {
    throw new Error(taskRejectReason("own-base"));
  }
  const escalation = reason
    ? {
        reason,
        by: who.actor,
        at: nowIso(),
        ...(origin?.agent || who.agent ? { agent: origin?.agent || who.agent } : {}),
        ...(origin?.requestId ? { requestId: origin.requestId } : {}),
      }
    : undefined;
  const task: Task = {
    id: uuid(),
    slug,
    title: input.title,
    status: "backlog",
    intent,
    baseBranch,
    agent: input.agent || who.agent || "cursor",
    allowedPaths: input.allowedPaths || [],
    forbiddenPaths: input.forbiddenPaths || [],
    layerIds: input.layerIds || [],
    allowFrozenTouch: Boolean(escalation),
    ...(escalation ? { escalation } : {}),
    notes: input.notes || "",
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  project.tasks.unshift(task);
  writeTaskCard(project, task);
  compileEntityWiki(touch(project));
  ledger(project, who, "createTask", task.slug, "ok", origin?.requestId);
  if (escalation) ledger(project, who, "escalateFrozen", task.slug, "ok", origin?.requestId);
  return { project, task };
}

function uniqueSlug(project: Project, base: string): string {
  let slug = base;
  let i = 2;
  while (project.tasks.some((task) => task.slug === slug)) {
    slug = `${base}-${i}`;
    i += 1;
  }
  return slug;
}

export function openWorktree(rootPath: string, taskId: string, caller: Caller = AGENT): { project: Project; worktree: Worktree } {
  const who = asCaller(caller);
  const project = requireProject(rootPath);
  guard(project, "createBranch", who, { taskId });
  const task = requireTask(project, taskId);
  if (task.worktreeId) {
    const existing = project.worktrees.find((item) => item.id === task.worktreeId);
    if (existing && existsSync(existing.path)) {
      task.status = task.status === "backlog" ? "active" : task.status;
      injectProjectFiles(project, task);
      writeTaskCard(project, task);
      compileEntityWiki(touch(project));
      syncGovernanceToWorktree(project, existing.path, task);
      publishTaskFilesToBranch(project, task);
      ledger(project, who, "createBranch", existing.branch);
      return { project, worktree: existing };
    }
  }

  const dest = worktreeRoot(project, task.slug);
  if (existsSync(dest)) {
    throw new Error(plantRejectReason(dest));
  }
  mkdirSync(dest, { recursive: true });
  const branch = plannedBranch(task);
  const base = task.baseBranch || project.baseBranch;
  try {
    addWorktree(project.rootPath, dest, branch, base);
  } catch (error) {
    rmSync(dest, { recursive: true, force: true });
    throw new Error(worktreeCreateRejectReason(error));
  }
  applyWorktreeInclude(project.rootPath, dest);

  const worktree: Worktree = {
    id: uuid(),
    taskId: task.id,
    path: dest,
    branch,
    baseBranch: base,
    status: "active",
    createdAt: nowIso(),
  };
  project.worktrees.push(worktree);
  task.worktreeId = worktree.id;
  task.status = "active";
  task.updatedAt = nowIso();
  injectProjectFiles(project, task);
  writeTaskCard(project, task);
  injectContext(project, task);
  compileEntityWiki(touch(project));
  syncGovernanceToWorktree(project, dest, task);
  publishTaskFilesToBranch(project, task);
  ledger(project, who, "createBranch", worktree.branch);
  return { project, worktree };
}

export function archiveWorktree(
  rootPath: string,
  taskId: string,
  force = false,
  caller: Caller = AGENT,
  confirm?: string,
): Project {
  const who = asCaller(caller);
  const project = requireProject(rootPath);
  const action = force ? "archiveWorktreeForce" : "archiveWorktree";
  guard(project, action, who, { taskId, force });
  const task = requireTask(project, taskId);
  const worktree = project.worktrees.find((item) => item.id === task.worktreeId);
  if (!worktree) throw new Error(archiveRejectReason());
  assertTypedConfirm(worktree.branch, confirm, getAppSettings().confirmDestructive, who.actor);
  if (existsSync(worktree.path)) {
    if (!force) excludeGovernance(worktree.path);
    removeWorktree(project.rootPath, worktree.path, force);
  }
  worktree.status = "archived";
  task.status = task.status === "done" ? "done" : "review";
  task.updatedAt = nowIso();
  clearPulseRecord(project, task.id);
  compileEntityWiki(touch(project));
  ledger(project, who, action, worktree.branch);
  return project;
}

export function guardStaged(
  rootPath: string,
  input: { taskId?: string; override?: boolean } = {},
): GuardResult {
  return runGuardStaged(rootPath, input);
}

export function blastForTask(rootPath: string, taskId: string): BlastReport {
  const project = requireProject(rootPath);
  const task = requireTask(project, taskId);
  const worktree = project.worktrees.find((item) => item.id === task.worktreeId);
  const files =
    worktree && existsSync(worktree.path)
      ? changedFiles(worktree.path, worktree.baseBranch)
      : worktree
        ? changedOnBranch(project.rootPath, worktree.baseBranch, worktree.branch)
        : changedOnBranch(project.rootPath, task.baseBranch || project.baseBranch, plannedBranch(task));
  return checkBlast(project, task, files);
}

export function generateHandoff(
  rootPath: string,
  taskId: string,
  extra: { toAgent?: string; decisions?: string; nextAction?: string } = {},
) {
  const project = requireProject(rootPath);
  const task = requireTask(project, taskId);
  const worktree = project.worktrees.find((item) => item.id === task.worktreeId);
  const live = liveHandoffRef(project, task);
  const blast = blastForTask(rootPath, taskId);
  const markdown = renderHandoff({
    project,
    task,
    fromAgent: task.agent,
    toAgent: extra.toAgent || "next-agent",
    worktreePath: worktree?.path,
    branch: live.branch,
    head: live.head,
    blast,
    files: blast.files,
    decisions: extra.decisions,
    nextAction: extra.nextAction,
  });
  const record = writeHandoff(project, markdown, task, task.agent, extra.toAgent || "next-agent");
  if (mergePolicy(project.policy).wiki.ingestHandoffs === "always") {
    ingestHandoffRaw(project, task, markdown);
  }
  writeTaskCard(project, task);
  compileEntityWiki(touch(project));
  if (worktree?.path) {
    syncGovernanceToWorktree(project, worktree.path, task);
    publishTaskFilesToBranch(project, task);
  }
  return { project, handoff: record, markdown, blast, prompt: resumePrompt(project, task) };
}

export function handoffView(rootPath: string, taskId: string): {
  markdown: string;
  valid: boolean;
  path: string;
  prompt: string;
} {
  const project = requireProject(rootPath);
  const task = requireTask(project, taskId);
  const markdown = readHandoff(project, task.id) || "";
  return {
    markdown,
    valid: Boolean(markdown && isValidHandoff(markdown)),
    path: markdown ? relative(project.rootPath, handoffPath(project, task.id)) : "",
    prompt: markdown ? resumePrompt(project, task) : "",
  };
}

export type DoneRejectKind = "handoff" | "handoff-empty" | "head" | "blast" | "wiki-raw" | "wiki-forbidden";

export function doneRejectReason(
  kind: DoneRejectKind,
  detail: { slug?: string; title?: string; count?: number } = {},
): string {
  if (kind === "handoff") return "还没有写完交接。先到交接页写决定和下一步，再点完成。";
  if (kind === "handoff-empty") return "交接还是空的。写上决定和下一步，再点完成。";
  if (kind === "head") return "交接对不上现在的版本。重新生成交接后再完成。";
  if (kind === "blast") return "改动超出了这张卡能碰的范围。先收回不该改的文件。";
  if (kind === "wiki-raw") {
    return `百科还拦着。先把「${detail.title || detail.slug || "这张卡"}」的交接原文写进百科（还有 ${detail.count ?? 0} 条没写）。`;
  }
  return `百科有 ${detail.count ?? 0} 类现在不让写。请你来处理。`;
}

function worktreeCreateRejectReason(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("已经在别的目录")) return message;
  return "创建检出失败。换个任务名，或先看看这棵树是不是已经在。";
}

export function markDone(rootPath: string, taskId: string, caller: Caller = AGENT): Project {
  const who = asCaller(caller);
  const project = requireProject(rootPath);
  guard(project, "markDone", who, { taskId });
  const task = requireTask(project, taskId);
  const body = readHandoff(project, task.id);
  if (!body || !isValidHandoff(body)) {
    throw new Error(doneRejectReason("handoff"));
  }
  if (!handoffFilled(body)) {
    throw new Error(doneRejectReason("handoff-empty"));
  }
  if (!isAlignedHandoff(project, task, body)) {
    throw new Error(doneRejectReason("head"));
  }
  const blast = blastForTask(rootPath, taskId);
  if (blast.verdict === "blocked") {
    throw new Error(doneRejectReason("blast"));
  }
  const policy = mergePolicy(project.policy);
  const lint = lintWiki(project);
  const uncompiled = lint.issues.filter(
    (item) => item.kind === "raw-uncompiled" && item.path.includes(`/handoffs/${task.id}/`),
  );
  const forbidden = lint.issues.filter((item) => item.kind === "write-forbidden");
  if (policy.wiki.gate === "block" && uncompiled.length) {
    throw new Error(doneRejectReason("wiki-raw", { title: task.title, count: uncompiled.length }));
  }
  if (policy.wiki.gate === "block" && forbidden.length) {
    throw new Error(doneRejectReason("wiki-forbidden", { count: forbidden.length }));
  }
  if (policy.wiki.gate === "warn" && (uncompiled.length || forbidden.length)) {
    ledger(project, who, "wiki.gate", task.slug, "warn");
  }
  if (policy.wiki.ingestHandoffs === "onDone" && body) {
    ingestHandoffRaw(project, task, body);
  }
  task.status = "done";
  task.updatedAt = nowIso();
  clearPulseRecord(project, task.id);
  writeTaskCard(project, task);
  compileEntityWiki(touch(project));
  const tree = project.worktrees.find((item) => item.id === task.worktreeId);
  if (tree?.path) {
    syncGovernanceToWorktree(project, tree.path, task);
    publishTaskFilesToBranch(project, task);
  }
  ledger(project, who, "markDone", task.slug);
  return project;
}

export function writeTaskPulse(
  rootPath: string,
  input: { taskId: string; doing: string; remainMin?: number; cite: { kind: string; value: string } },
  caller: Caller = AGENT,
): { project: Project; pulse: Pulse } {
  const who = asCaller(caller);
  const project = requireProject(rootPath);
  const task = requireTask(project, input.taskId);
  const agent = authorizePulseWrite(task, who);
  const files = blastFileSet(project, task);
  const cite = normalizeCite(
    project,
    task,
    {
      kind: input.cite.kind === "sha" ? "sha" : "path",
      value: String(input.cite.value || ""),
    },
    files,
  );
  if (!cite.value) throw new Error(citeRejectReason(cite));
  const pulse = parsePulse({
    v: 1,
    taskId: task.id,
    agent,
    doing: input.doing,
    remainMin: input.remainMin,
    cite,
  });
  pulse.writtenAt = nowIso();
  if (!citeValid(project, task, pulse.cite, files)) {
    throw new Error(citeRejectReason(pulse.cite));
  }
  writePulseRecord(project, pulse);
  const tree = project.worktrees.find((item) => item.id === task.worktreeId);
  if (tree?.path) syncGovernanceToWorktree(project, tree.path, task);
  return { project, pulse };
}

export function clearTaskPulse(rootPath: string, taskId: string, caller: Caller = AGENT): Project {
  const who = asCaller(caller);
  authorizePulseClear(who);
  const project = requireProject(rootPath);
  requireTask(project, taskId);
  clearPulseRecord(project, taskId);
  return project;
}

export function vaultSearch(rootPath: string, query: string): VaultNote[] {
  const project = requireProject(rootPath);
  return searchNotes(project, query);
}

export function vaultList(rootPath: string): VaultNote[] {
  const project = requireProject(rootPath);
  return listNotes(project);
}

export function projectExists(rootPath: string): boolean {
  return existsSync(projectFile(rootPath));
}

export function projectMap(rootPath: string): RepoMap {
  const project = requireProject(rootPath);
  return compileEntityWiki(project);
}

export function snapshotWithMaps(): {
  catalog: Catalog;
  projects: Project[];
  maps: RepoMap[];
  holdings: Holdings[];
  requests: (ConsentRequest & { rootPath: string })[];
  ledgerTail: { rootPath: string; lines: string[] }[];
  drift: { rootPath: string; items: Drift[] }[];
  occupancy: { rootPath: string; rows: Occupancy[] }[];
} {
  const snap = listSnapshot();
  const maps = snap.projects.map((project) => compileEntityWiki(project));
  return {
    ...snap,
    maps,
    holdings: snap.projects.map((project, index) => collectHoldings(project, maps[index])),
    requests: snap.projects.flatMap((project) =>
      listPendingRequests(project).map((item) => ({ ...item, rootPath: project.rootPath })),
    ),
    ledgerTail: snap.projects.map((project) => ({ rootPath: project.rootPath, lines: ledgerTail(project, 10) })),
    drift: snap.projects.map((project) => ({ rootPath: project.rootPath, items: detectDrift(project) })),
    occupancy: snap.projects.map((project, index) => ({
      rootPath: project.rootPath,
      rows: occupancyForProject(project, { map: maps[index] }),
    })),
  };
}

export function projectDrift(rootPath: string): Drift[] {
  return detectDrift(requireProject(rootPath));
}

export function syncAgents(
  rootPath: string,
  caller: Caller = AGENT,
  taskId?: string,
): { project: Project; before: Drift[]; drift: Drift[] } {
  const who = asCaller(caller);
  if (who.actor !== "human") {
    throw new PolicyError("never", "editCharter", humanRejectReason("sync"));
  }
  const project = requireProject(rootPath);
  const before = detectDrift(project);
  const task = taskId
    ? requireTask(project, taskId)
    : project.tasks.find((item) => item.status === "active" && item.worktreeId);
  injectProjectFiles(project, task, { force: true });
  if (task?.worktreeId) {
    const tree = project.worktrees.find((item) => item.id === task.worktreeId);
    if (tree?.path) {
      syncGovernanceToWorktree(project, tree.path, task);
      publishTaskFilesToBranch(project, task);
    }
  }
  ledger(project, who, "syncAgents", "AGENTS.md", before.map((item) => item.kind).join(",") || "clean");
  return { project, before, drift: detectDrift(project) };
}

export function projectHoldings(rootPath: string): Holdings {
  const project = requireProject(rootPath);
  return collectHoldings(project, compileEntityWiki(project));
}

export function projectGraph(rootPath: string): ProcessGraph {
  return buildProcessGraph(requireProject(rootPath));
}

export function listArtifacts(rootPath: string): { artifacts: Artifact[]; versions: ArtifactVersionView[] } {
  const project = requireProject(rootPath);
  const holdings = collectHoldings(project);
  return { artifacts: holdings.artifacts, versions: holdings.versions };
}

export function pinProjectArtifact(
  rootPath: string,
  input: { name: string; checkout?: string; branch?: string; note?: string; taskId?: string },
  caller: Caller = AGENT,
): { version: ArtifactVersion; created: boolean; holdings: Holdings } {
  const who = asCaller(caller);
  const project = requireProject(rootPath);
  const name = input.name?.trim() || "";
  if (who.actor !== "human") {
    ledger(project, who, "pinArtifact", name || "artifact", "denied");
    throw new PolicyError("never", "editCharter", humanRejectReason("pin"));
  }
  if (!name) throw new Error(pinNameRejectReason());
  const result = writeArtifactPin(project, {
    name,
    checkout: input.checkout,
    branch: input.branch,
    note: input.note,
    taskId: input.taskId,
    actor: who.actor,
    agent: who.agent,
  });
  compileEntityWiki(project);
  ledger(project, who, "pinArtifact", result.version.id, result.created ? "ok" : "exists");
  return { ...result, holdings: collectHoldings(project) };
}

export function unpinProjectArtifact(
  rootPath: string,
  id: string,
  caller: Caller = AGENT,
): { version: ArtifactVersion; holdings: Holdings } {
  const who = asCaller(caller);
  const project = requireProject(rootPath);
  const pinId = id?.trim() || "";
  if (who.actor !== "human") {
    ledger(project, who, "unpinArtifact", pinId || "artifact", "denied");
    throw new PolicyError("never", "editCharter", humanRejectReason("unpin"));
  }
  if (!pinId) throw new Error(pinUnpinRejectReason("empty"));
  const version = removeArtifactPin(project, pinId);
  if (!version) throw new Error(pinUnpinRejectReason("missing", pinId));
  compileEntityWiki(project);
  ledger(project, who, "unpinArtifact", version.id);
  return { version, holdings: collectHoldings(project) };
}

export function plantBranch(
  rootPath: string,
  branch: string,
  caller: Caller = AGENT,
): { project: Project; path: string; planted: boolean } {
  const who = asCaller(caller);
  const project = requireProject(rootPath);
  const name = branch.trim();
  if (!name) throw new Error(plantNameRejectReason());
  assertAgentDeclared(project, "plantBranch", who, name);
  guard(project, "plantBranch", who, { branch: name });
  const live = listLiveWorktrees(project.rootPath);
  const existing = live.find((item) => item.branch === name);
  if (existing) {
    compileEntityWiki(project);
    ledger(project, who, "plantBranch", name, "exists");
    return { project, path: existing.path, planted: false };
  }
  const dest = worktreeRoot(project, `plant-${slugify(name.replace(/\//g, "-"))}`);
  if (existsSync(dest)) throw new Error(plantRejectReason(dest));
  mkdirSync(dest, { recursive: true });
  try {
    addWorktree(project.rootPath, dest, name, project.baseBranch);
  } catch (error) {
    rmSync(dest, { recursive: true, force: true });
    throw new Error(worktreeCreateRejectReason(error));
  }
  applyWorktreeInclude(project.rootPath, dest);
  compileEntityWiki(project);
  syncGovernanceToWorktree(project, dest);
  ledger(project, who, "plantBranch", name);
  return { project, path: dest, planted: true };
}

export function wikiList(rootPath: string, query = ""): WikiPage[] {
  const project = requireProject(rootPath);
  seedWiki(project);
  return query ? searchWiki(project, query) : listWikiPages(project);
}

export function wikiPage(rootPath: string, relPath: string): WikiPage {
  const project = requireProject(rootPath);
  return readWikiPage(project, relPath);
}

export function wikiLint(rootPath: string, fix = false, caller: Caller = AGENT): WikiLint {
  const who = asCaller(caller);
  const project = requireProject(rootPath);
  if (fix) guard(project, "lintFix", who, { fix: true });
  const result = lintWiki(project, fix);
  if (fix) ledger(project, who, "lintFix", "wiki");
  return result;
}

export function wikiWrite(
  rootPath: string,
  input: { bucket: "concepts" | "sources" | "syntheses"; title: string; body: string },
  caller: Caller = AGENT,
): { path: string } {
  const who = asCaller(caller);
  const project = requireProject(rootPath);
  const result = writeWikiPage(project, input, who);
  ledger(project, who, "wikiWrite", result.path);
  return result;
}

export function wikiIngest(rootPath: string, title: string, body: string, topic?: string, caller: Caller = AGENT) {
  const who = asCaller(caller);
  const project = requireProject(rootPath);
  guard(project, "ingestRaw", who, { title, body, topic });
  const result = ingestRaw(project, { title, body, topic });
  ledger(project, who, "ingestRaw", result.path);
  return result;
}

export function sourceList(rootPath: string, dir?: string): SourceEntry[] {
  const project = requireProject(rootPath);
  return listSource(project, dir || rootPath);
}

export function deleteBranch(
  rootPath: string,
  name: string,
  force = false,
  caller: Caller = AGENT,
  confirm?: string,
): Project {
  const who = asCaller(caller);
  const project = requireProject(rootPath);
  const branch = name.trim();
  if (!branch) throw new Error(deleteRejectReason("empty"));
  assertAgentDeclared(project, "deleteBranch", who, branch);
  guard(project, "deleteBranch", who, { branch, force });
  if (branch === project.baseBranch) {
    throw new Error(deleteRejectReason("base", { branch }));
  }
  assertTypedConfirm(branch, confirm, getAppSettings().confirmDestructive, who.actor);
  const live = listLiveWorktrees(project.rootPath);
  if (live.some((item) => item.branch === branch)) {
    throw new Error(deleteRejectReason("live", { branch }));
  }
  if (currentBranch(project.rootPath) === branch) {
    throw new Error(deleteRejectReason("head", { branch }));
  }
  if (!isMerged(project.rootPath, branch, project.baseBranch)) {
    if (who.actor !== "human") {
      throw new Error(deleteRejectReason("unmerged-agent"));
    }
    if (!force) {
      throw new Error(deleteRejectReason("unmerged", { branch, base: project.baseBranch }));
    }
  }
  gitDeleteBranch(project.rootPath, branch, force);
  compileEntityWiki(touch(project));
  injectProjectFiles(project);
  ledger(project, who, "deleteBranch", branch);
  return project;
}

export function updatePolicy(rootPath: string, partial: Partial<Policy>, caller: Caller = AGENT): Policy {
  const who = asCaller(caller);
  if (who.actor !== "human") {
    throw new PolicyError("never", "editCharter", humanRejectReason("policy"));
  }
  const project = requireProject(rootPath);
  const presetOnly =
    Boolean(partial.preset) &&
    partial.preset !== "custom" &&
    !partial.agentMay &&
    !partial.wiki &&
    !partial.declared;
  const base = presetOnly && partial.preset && partial.preset !== "custom" ? defaultPolicy(partial.preset) : project.policy;
  project.policy = mergePolicy({
    ...base,
    preset: partial.preset || base.preset,
    agentMay: { ...base.agentMay, ...(partial.agentMay || {}) },
    wiki: { ...base.wiki, ...(partial.wiki || {}), agentWrites: { ...base.wiki.agentWrites, ...(partial.wiki?.agentWrites || {}) } },
    declared: { ...base.declared, ...(partial.declared || {}) },
    updatedAt: nowIso(),
    updatedBy: "human",
  });
  injectProjectFiles(project);
  compileEntityWiki(touch(project));
  ledger(project, who, "updatePolicy", project.policy.preset);
  return project.policy;
}

export function updateAppSettings(partial: Partial<AppSettings>): AppSettings {
  const catalog = loadCatalog();
  catalog.settings = mergeAppSettings({ ...catalog.settings, ...partial });
  saveCatalog(catalog);
  return catalog.settings;
}

export function getAppSettings(): AppSettings {
  return loadCatalog().settings;
}

export function getPolicy(rootPath: string): Policy {
  return requireProject(rootPath).policy;
}

export function projectLedger(rootPath: string): string {
  return readLedger(requireProject(rootPath));
}

export function listConsentRequests(rootPath: string): ConsentRequest[] {
  return listRequests(requireProject(rootPath));
}

const HUMAN: Caller = { actor: "human", consent: true };

function replayRequest(rootPath: string, request: ConsentRequest): void {
  const params = request.params;
  switch (request.action) {
    case "createTask":
    case "escalateFrozen": {
      const input = { ...(params as CreateTaskInput) };
      const escalationReason =
        (typeof input.escalationReason === "string" && input.escalationReason) || request.reason;
      createTask(rootPath, { ...input, escalationReason }, HUMAN, {
        requestId: request.id,
        agent: request.agent,
      });
      return;
    }
    case "createBranch":
      openWorktree(rootPath, String(params.taskId || ""), HUMAN);
      return;
    case "plantBranch":
      plantBranch(rootPath, String(params.branch || ""), HUMAN);
      return;
    case "archiveWorktree":
    case "archiveWorktreeForce": {
      const taskId = String(params.taskId || "");
      const project = requireProject(rootPath);
      const task = requireTask(project, taskId);
      const tree = project.worktrees.find((item) => item.id === task.worktreeId);
      archiveWorktree(rootPath, taskId, request.action === "archiveWorktreeForce", HUMAN, tree?.branch);
      return;
    }
    case "deleteBranch": {
      const branch = String(params.branch || params.name || "");
      deleteBranch(rootPath, branch, Boolean(params.force), HUMAN, branch);
      return;
    }
    case "markDone":
      markDone(rootPath, String(params.taskId || ""), HUMAN);
      return;
    case "editCharter":
      updateCharter(rootPath, params.charter as Charter, HUMAN);
      return;
    case "ingestRaw":
      wikiIngest(rootPath, String(params.title || ""), String(params.body || ""), params.topic as string, HUMAN);
      return;
    case "lintFix":
      wikiLint(rootPath, true, HUMAN);
      return;
    default:
      throw new Error(requestRejectReason("replay", request.action));
  }
}

export function decideRequest(
  rootPath: string,
  requestId: string,
  approve: boolean,
  caller: Caller = AGENT,
  note?: string,
): ConsentRequest {
  const who = asCaller(caller);
  if (who.actor !== "human") throw new Error(humanRejectReason("decide"));
  const project = requireProject(rootPath);
  const request = loadRequest(project, requestId);
  if (request.status !== "pending") throw new Error(requestRejectReason("not-pending", requestId));
  request.decidedAt = nowIso();
  request.decidedBy = "human";
  if (note) request.note = note;
  if (!approve) {
    request.status = "denied";
    saveRequest(project, request);
    ledger(project, who, request.action, request.id, "denied", request.id);
    return request;
  }
  request.status = "approved";
  saveRequest(project, request);
  try {
    replayRequest(rootPath, request);
    request.status = "executed";
    saveRequest(project, request);
    ledger(project, who, request.action, request.id, "executed", request.id);
  } catch (error) {
    request.status = "failed";
    request.error = error instanceof Error ? error.message : String(error);
    saveRequest(project, request);
    ledger(project, who, request.action, request.id, "failed", request.id);
    throw error;
  }
  return request;
}

export { PolicyError };
