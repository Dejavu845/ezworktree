import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { runGit } from "../src/git.ts";
import { PolicyError } from "../src/policy.ts";
import { createRequest, requestRejectReason, saveRequest } from "../src/requests.ts";
import { loadProject } from "../src/store.ts";
import {
  archiveWorktree,
  createTask,
  decideRequest,
  humanRejectReason,
  initProject,
  listConsentRequests,
  openWorktree,
  snapshotWithMaps,
} from "../src/service.ts";

const HOME = mkdtempSync(join(tmpdir(), "requests-home-"));
process.env.LATTICE_HOME = HOME;

function makeRepo(): string {
  const root = mkdtempSync(join(tmpdir(), "requests-repo-"));
  runGit(root, ["init", "-b", "main"]);
  runGit(root, ["config", "user.email", "requests@test.local"]);
  runGit(root, ["config", "user.name", "Requests"]);
  mkdirSync(join(root, "app"), { recursive: true });
  writeFileSync(join(root, "app", "page.tsx"), "export default function Page() { return null }\n");
  writeFileSync(join(root, "README.md"), "# demo\n");
  runGit(root, ["add", "."]);
  runGit(root, ["commit", "-m", "init"]);
  return root;
}

const repos: string[] = [];

after(() => {
  rmSync(HOME, { recursive: true, force: true });
  for (const repo of repos) rmSync(repo, { recursive: true, force: true });
});

describe("consent request queue", () => {
  it("queues agent archive under balanced and archives after human approve", () => {
    const repo = makeRepo();
    repos.push(repo);
    initProject(repo, "Harbor", "studio");
    const { task } = createTask(repo, { title: "approve-archive", allowedPaths: ["app/**"] }, { actor: "human" });
    const { worktree } = openWorktree(repo, task.id, { actor: "human" });
    assert.ok(existsSync(worktree.path));
    let requestId = "";
    assert.throws(() => archiveWorktree(repo, task.id, false, { actor: "agent" }), (err: unknown) => {
      assert.ok(err instanceof PolicyError);
      assert.equal(err.code, "ask");
      assert.equal(err.action, "archiveWorktree");
      requestId = err.requestId || "";
      return true;
    });
    assert.ok(requestId);
    assert.ok(existsSync(worktree.path));
    const pending = listConsentRequests(repo).filter((item) => item.status === "pending");
    assert.equal(pending.length, 1);
    assert.equal(pending[0].id, requestId);
    const snap = snapshotWithMaps();
    assert.ok(snap.requests.some((item) => item.id === requestId && item.rootPath === repo));
    assert.ok(snap.ledgerTail.some((item) => item.rootPath === repo && item.lines.length > 0));
    decideRequest(repo, requestId, true, { actor: "human" });
    assert.equal(existsSync(worktree.path), false);
    const executed = listConsentRequests(repo).find((item) => item.id === requestId);
    assert.equal(executed?.status, "executed");
  });

  it("speaks Chinese when an agent tries to decide a request", () => {
    const repo = makeRepo();
    repos.push(repo);
    initProject(repo, "AgentDecide", "studio");
    const before = listConsentRequests(repo);
    assert.equal(humanRejectReason("decide"), "只有人能批请求。");
    assert.throws(() => decideRequest(repo, "ghost", true), (err: unknown) => {
      assert.equal((err as Error).message, humanRejectReason("decide"));
      assert.equal((err as Error).message.includes("Only a human"), false);
      return true;
    });
    assert.deepEqual(listConsentRequests(repo), before);
  });

  it("leaves the worktree in place when a human denies archive", () => {
    const repo = makeRepo();
    repos.push(repo);
    initProject(repo, "Harbor", "studio");
    const { task } = createTask(repo, { title: "deny-archive", allowedPaths: ["app/**"] }, { actor: "human" });
    const { worktree } = openWorktree(repo, task.id, { actor: "human" });
    let requestId = "";
    assert.throws(() => archiveWorktree(repo, task.id, false, { actor: "agent" }), (err: unknown) => {
      assert.ok(err instanceof PolicyError);
      requestId = (err as PolicyError).requestId || "";
      return true;
    });
    decideRequest(repo, requestId, false, { actor: "human" });
    assert.ok(existsSync(worktree.path));
    const denied = listConsentRequests(repo).find((item) => item.id === requestId);
    assert.equal(denied?.status, "denied");
    assert.throws(() => decideRequest(repo, requestId, true, { actor: "human" }), (err: unknown) => {
      assert.equal((err as Error).message, requestRejectReason("not-pending", requestId));
      assert.equal((err as Error).message.includes("not pending"), false);
      return true;
    });
    assert.equal(listConsentRequests(repo).find((item) => item.id === requestId)?.status, "denied");
  });

  it("speaks Chinese when a request id is missing", () => {
    const repo = makeRepo();
    repos.push(repo);
    initProject(repo, "MissingRequest", "studio");
    assert.equal(requestRejectReason("missing", "ghost"), "找不到请求「ghost」。");
    assert.throws(() => decideRequest(repo, "ghost", true, { actor: "human" }), (err: unknown) => {
      assert.equal((err as Error).message, requestRejectReason("missing", "ghost"));
      return true;
    });
    assert.equal(listConsentRequests(repo).length, 0);
  });

  it("speaks Chinese when a request action cannot be replayed", () => {
    const repo = makeRepo();
    repos.push(repo);
    initProject(repo, "ReplayNope", "studio");
    const project = loadProject(repo)!;
    const request = createRequest(project, { action: "createTask", params: {}, reason: "ghost" });
    request.action = "nope" as never;
    saveRequest(project, request);
    assert.equal(requestRejectReason("replay", "nope"), "动作「nope」不能再做一遍。");
    assert.equal(requestRejectReason("replay", "createTask"), "动作「开新任务」不能再做一遍。");
    assert.throws(() => decideRequest(repo, request.id, true, { actor: "human" }), (err: unknown) => {
      assert.equal((err as Error).message, requestRejectReason("replay", "nope"));
      assert.equal((err as Error).message.includes("cannot be replayed"), false);
      return true;
    });
    assert.equal(listConsentRequests(repo).find((item) => item.id === request.id)?.status, "failed");
  });
});
