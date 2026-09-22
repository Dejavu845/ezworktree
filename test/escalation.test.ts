import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { checkBlast } from "../src/blast.ts";
import { ESCALATION_ERROR, formatEscalation, normalizeEscalationReason } from "../src/escalation.ts";
import { runGit } from "../src/git.ts";
import { injectProjectFiles } from "../src/inject.ts";
import { PolicyError } from "../src/policy.ts";
import {
  createTask,
  decideRequest,
  generateHandoff,
  initProject,
  listConsentRequests,
  openWorktree,
  projectLedger,
} from "../src/service.ts";
import type { Task } from "../src/types.ts";

const HOME = mkdtempSync(join(tmpdir(), "escalation-home-"));
process.env.LATTICE_HOME = HOME;

function makeRepo(): string {
  const root = mkdtempSync(join(tmpdir(), "escalation-repo-"));
  runGit(root, ["init", "-b", "main"]);
  runGit(root, ["config", "user.email", "escalation@test.local"]);
  runGit(root, ["config", "user.name", "Escalation"]);
  writeFileSync(join(root, "package.json"), "{}\n");
  writeFileSync(join(root, "README.md"), "# demo\n");
  mkdirSync(join(root, "app"), { recursive: true });
  writeFileSync(join(root, "app", "page.tsx"), "export default function Page() { return null }\n");
  writeFileSync(join(root, ".env"), "SECRET=1\n");
  runGit(root, ["add", "package.json", "README.md", "app/page.tsx"]);
  runGit(root, ["commit", "-m", "init"]);
  return root;
}

const repos: string[] = [];

after(() => {
  rmSync(HOME, { recursive: true, force: true });
  for (const repo of repos) rmSync(repo, { recursive: true, force: true });
});

function fixture(): string {
  const repo = makeRepo();
  repos.push(repo);
  initProject(repo, "Harbor", "studio");
  return repo;
}

function baseTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "t",
    slug: "demo",
    title: "demo",
    status: "active",
    agent: "cursor",
    allowedPaths: [],
    forbiddenPaths: [],
    layerIds: [],
    allowFrozenTouch: false,
    notes: "",
    createdAt: "",
    updatedAt: "",
    ...overrides,
  };
}

function throwsEscalation(fn: () => unknown): void {
  assert.throws(fn, (err: unknown) => {
    assert.ok(err instanceof Error);
    assert.equal(err.message, ESCALATION_ERROR);
    return true;
  });
}

describe("escalation reason", () => {
  it("normalizes whitespace and rejects short reasons", () => {
    assert.equal(normalizeEscalationReason("  改构建配置  "), "改构建配置");
    assert.equal(normalizeEscalationReason("改  构建配置"), "改 构建配置");
    assert.equal(normalizeEscalationReason("abc"), null);
    assert.equal(normalizeEscalationReason("   "), null);
    assert.equal(normalizeEscalationReason(1), null);
    assert.equal(formatEscalation(baseTask()), "—");
    assert.equal(
      formatEscalation(baseTask({ allowFrozenTouch: true })),
      "allowFrozenTouch (no reason on record)",
    );
    assert.match(
      formatEscalation(
        baseTask({
          allowFrozenTouch: true,
          escalation: { reason: "改构建配置", by: "human", at: "t" },
        }),
      ),
      /^改构建配置 — by human/,
    );
  });

  it("rejects missing, blank, and short reasons; stores a valid one; ignores reason when frozen is off", () => {
    const repo = fixture();
    throwsEscalation(() =>
      createTask(repo, { title: "no-reason", allowedPaths: ["app/**"], allowFrozenTouch: true }, { actor: "human" }),
    );
    throwsEscalation(() =>
      createTask(
        repo,
        { title: "blank", allowedPaths: ["app/**"], allowFrozenTouch: true, escalationReason: "   " },
        { actor: "human" },
      ),
    );
    throwsEscalation(() =>
      createTask(
        repo,
        { title: "abc", allowedPaths: ["app/**"], allowFrozenTouch: true, escalationReason: "abc" },
        { actor: "human" },
      ),
    );
    const { task } = createTask(
      repo,
      {
        title: "touch-frozen",
        allowedPaths: ["package.json"],
        allowFrozenTouch: true,
        escalationReason: "改构建配置",
      },
      { actor: "human" },
    );
    assert.equal(task.allowFrozenTouch, true);
    assert.equal(task.escalation?.reason, "改构建配置");
    assert.equal(task.escalation?.by, "human");
    const ignored = createTask(
      repo,
      {
        title: "no-frozen",
        allowedPaths: ["app/**"],
        allowFrozenTouch: false,
        escalationReason: "改构建配置",
      },
      { actor: "human" },
    );
    assert.equal(ignored.task.allowFrozenTouch, false);
    assert.equal(ignored.task.escalation, undefined);
  });

  it("does not create a request without a reason; asks with a reason; records requestId and ledger after approve", () => {
    const repo = fixture();
    throwsEscalation(() =>
      createTask(
        repo,
        { title: "agent-no-reason", allowedPaths: ["package.json"], allowFrozenTouch: true },
        { actor: "agent", agent: "cursor" },
      ),
    );
    assert.equal(listConsentRequests(repo).length, 0);

    let requestId = "";
    assert.throws(
      () =>
        createTask(
          repo,
          {
            title: "agent-frozen",
            allowedPaths: ["package.json"],
            allowFrozenTouch: true,
            escalationReason: "改构建配置",
          },
          { actor: "agent", agent: "cursor" },
        ),
      (err: unknown) => {
        assert.ok(err instanceof PolicyError);
        assert.equal(err.code, "ask");
        assert.equal(err.action, "escalateFrozen");
        requestId = err.requestId || "";
        return true;
      },
    );
    assert.ok(requestId);
    const pending = listConsentRequests(repo).find((item) => item.id === requestId);
    assert.equal(pending?.reason, "改构建配置");
    assert.equal(pending?.status, "pending");
    assert.equal(pending?.params.escalationReason, "改构建配置");
    assert.equal(
      initProject(repo, "Harbor", "studio").tasks.some((item) => item.title === "agent-frozen"),
      false,
    );

    decideRequest(repo, requestId, true, { actor: "human" });
    const project = initProject(repo, "Harbor", "studio");
    const task = project.tasks.find((item) => item.title === "agent-frozen");
    assert.ok(task);
    assert.equal(task.allowFrozenTouch, true);
    assert.equal(task.escalation?.reason, "改构建配置");
    assert.equal(task.escalation?.requestId, requestId);
    const ledger = projectLedger(repo);
    assert.match(ledger, /escalateFrozen/);
    assert.match(ledger, new RegExp(requestId));
  });

  it("blast copy includes the reason; boolean-only has no reason on record; .env and allowedPaths stay closed", () => {
    const repo = fixture();
    const { project, task } = createTask(
      repo,
      {
        title: "blast-reason",
        allowedPaths: [],
        allowFrozenTouch: true,
        escalationReason: "改构建配置",
      },
      { actor: "human" },
    );
    const allowed = checkBlast(project, task, ["package.json"]);
    assert.equal(allowed.verdict, "ok");
    assert.match(allowed.findings[0].reason, /frozen layer \(Foundation\) · escalated: 改构建配置/);

    const legacy = checkBlast(project, { ...task, escalation: undefined, allowFrozenTouch: true }, ["package.json"]);
    assert.equal(legacy.verdict, "ok");
    assert.match(legacy.findings[0].reason, /frozen layer \(Foundation\) · allowFrozenTouch \(no reason on record\)/);

    const env = checkBlast(project, task, [".env"]);
    assert.equal(env.verdict, "blocked");
    assert.ok(env.findings.some((item) => item.reason.includes("do-not-touch")));

    const closed = checkBlast(project, { ...task, allowedPaths: ["app/**"] }, ["lib/secret.ts"]);
    assert.equal(closed.verdict, "blocked");
    assert.ok(closed.findings.some((item) => item.reason.includes("outside allowed paths")));
  });

  it("writes the reason into the task card, wiki entity, AGENTS block, and handoff", () => {
    const repo = fixture();
    const { project, task } = createTask(
      repo,
      {
        title: "render-reason",
        allowedPaths: ["package.json"],
        allowFrozenTouch: true,
        escalationReason: "改构建配置",
      },
      { actor: "human" },
    );
    const card = readFileSync(join(repo, ".lattice", "tasks", `${task.id}.md`), "utf8");
    assert.match(card, /改构建配置/);
    const entity = readFileSync(join(repo, ".lattice", "wiki", "entities", `task-${task.slug}.md`), "utf8");
    assert.match(entity, /改构建配置/);
    injectProjectFiles(project, task);
    const agents = readFileSync(join(repo, "AGENTS.md"), "utf8");
    assert.doesNotMatch(agents, /改构建配置/);
    assert.doesNotMatch(agents, /Current task:/);
    assert.match(agents, /main checkout/);
    const { worktree } = openWorktree(repo, task.id, { actor: "human" });
    const treeAgents = readFileSync(join(worktree.path, "AGENTS.md"), "utf8");
    assert.match(treeAgents, /改构建配置/);
    assert.match(treeAgents, /Current task:/);
    const { markdown, prompt } = generateHandoff(repo, task.id);
    assert.match(markdown, /改构建配置/);
    assert.match(prompt, /Stay within that reason/);
  });
});
