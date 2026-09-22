import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { runGit } from "../src/git.ts";
import { assertAllowed, defaultPolicy, mergePolicy, PolicyError } from "../src/policy.ts";
import { createTask, deleteBranch, humanRejectReason, initProject, markDone, updatePolicy } from "../src/service.ts";
import { loadProject, projectFile } from "../src/store.ts";

const HOME = mkdtempSync(join(tmpdir(), "policy-home-"));
process.env.LATTICE_HOME = HOME;

function makeRepo(): string {
  const root = mkdtempSync(join(tmpdir(), "policy-repo-"));
  runGit(root, ["init", "-b", "main"]);
  runGit(root, ["config", "user.email", "policy@test.local"]);
  runGit(root, ["config", "user.name", "Policy"]);
  writeFileSync(join(root, "README.md"), "# demo\n");
  mkdirSync(join(root, "app"), { recursive: true });
  writeFileSync(join(root, "app", "page.tsx"), "export default function Page() { return null }\n");
  runGit(root, ["add", "."]);
  runGit(root, ["commit", "-m", "init"]);
  return root;
}

const repos: string[] = [];

after(() => {
  rmSync(HOME, { recursive: true, force: true });
  for (const repo of repos) rmSync(repo, { recursive: true, force: true });
});

describe("repo-level policy", () => {
  it("expands locked, balanced, and open presets", () => {
    const locked = defaultPolicy("locked");
    assert.equal(locked.preset, "locked");
    assert.equal(locked.agentMay.createTask, "ask");
    assert.equal(locked.agentMay.createBranch, "ask");
    assert.equal(locked.agentMay.plantBranch, "ask");
    assert.equal(locked.agentMay.archiveWorktree, "ask");
    assert.equal(locked.agentMay.archiveWorktreeForce, "never");
    assert.equal(locked.agentMay.deleteBranch, "never");
    assert.equal(locked.agentMay.markDone, "ask");
    assert.equal(locked.agentMay.escalateFrozen, "never");
    assert.equal(locked.agentMay.editCharter, "never");
    assert.equal(locked.agentMay.ingestRaw, "allow");
    assert.equal(locked.agentMay.lintFix, "ask");
    assert.equal(locked.wiki.gate, "block");
    assert.equal(locked.wiki.ingestHandoffs, "always");
    assert.equal(locked.declared.push, "never");
    assert.equal(locked.declared.publishArtifacts, "never");

    const balanced = defaultPolicy("balanced");
    assert.equal(balanced.preset, "balanced");
    assert.equal(balanced.agentMay.createTask, "allow");
    assert.equal(balanced.agentMay.createBranch, "allow");
    assert.equal(balanced.agentMay.plantBranch, "allow");
    assert.equal(balanced.agentMay.archiveWorktree, "ask");
    assert.equal(balanced.agentMay.archiveWorktreeForce, "never");
    assert.equal(balanced.agentMay.deleteBranch, "never");
    assert.equal(balanced.agentMay.markDone, "ask");
    assert.equal(balanced.agentMay.escalateFrozen, "ask");
    assert.equal(balanced.agentMay.editCharter, "never");
    assert.equal(balanced.agentMay.ingestRaw, "allow");
    assert.equal(balanced.agentMay.lintFix, "allow");
    assert.equal(balanced.wiki.gate, "warn");
    assert.equal(balanced.declared.push, "ask");
    assert.equal(balanced.declared.publishArtifacts, "never");

    const open = defaultPolicy("open");
    assert.equal(open.preset, "open");
    assert.equal(open.agentMay.archiveWorktree, "allow");
    assert.equal(open.agentMay.archiveWorktreeForce, "ask");
    assert.equal(open.agentMay.deleteBranch, "ask");
    assert.equal(open.agentMay.markDone, "allow");
    assert.equal(open.agentMay.escalateFrozen, "ask");
    assert.equal(open.agentMay.editCharter, "ask");
    assert.equal(open.wiki.gate, "warn");
    assert.equal(open.declared.push, "allow");
    assert.equal(open.declared.publishArtifacts, "ask");
  });

  it("clamps destructive allow to ask", () => {
    const open = mergePolicy({ preset: "open", agentMay: { deleteBranch: "allow" } as never });
    assert.equal(open.agentMay.deleteBranch, "ask");
    assert.equal(open.preset, "open");
    const balanced = mergePolicy({ preset: "balanced", agentMay: { deleteBranch: "allow" } as never });
    assert.equal(balanced.agentMay.deleteBranch, "ask");
    assert.equal(balanced.preset, "custom");
    const force = mergePolicy({ preset: "open", agentMay: { archiveWorktreeForce: "allow", editCharter: "allow", escalateFrozen: "allow" } as never });
    assert.equal(force.agentMay.archiveWorktreeForce, "ask");
    assert.equal(force.agentMay.editCharter, "ask");
    assert.equal(force.agentMay.escalateFrozen, "ask");
  });

  it("clamps ingestRaw never to ask", () => {
    const policy = mergePolicy({ preset: "balanced", agentMay: { ingestRaw: "never" } as never });
    assert.equal(policy.agentMay.ingestRaw, "ask");
    assert.equal(policy.preset, "custom");
  });

  it("marks custom when a field leaves the preset template", () => {
    const custom = mergePolicy({ preset: "balanced", agentMay: { markDone: "allow" } as never });
    assert.equal(custom.preset, "custom");
    assert.equal(custom.agentMay.markDone, "allow");
    const same = mergePolicy({ preset: "balanced" });
    assert.equal(same.preset, "balanced");
  });

  it("turns wiki.gate off when concepts writes are disabled", () => {
    const policy = mergePolicy({
      preset: "balanced",
      wiki: { ingestHandoffs: "always", agentWrites: { concepts: false, sources: true, syntheses: true }, gate: "block" },
    });
    assert.equal(policy.wiki.gate, "off");
    assert.equal(policy.preset, "custom");
  });

  it("lets humans through and enforces agent consent", () => {
    const policy = defaultPolicy("balanced");
    assert.doesNotThrow(() => assertAllowed(policy, "deleteBranch", { actor: "human" }));
    assert.doesNotThrow(() => assertAllowed(policy, "createTask", { actor: "agent" }));
    assert.throws(() => assertAllowed(policy, "deleteBranch", { actor: "agent" }), (err: unknown) => {
      assert.ok(err instanceof PolicyError);
      assert.equal(err.code, "never");
      assert.equal(err.action, "deleteBranch");
      return true;
    });
    assert.throws(() => assertAllowed(policy, "markDone", { actor: "agent" }), (err: unknown) => {
      assert.ok(err instanceof PolicyError);
      assert.equal(err.code, "ask");
      return true;
    });
    assert.doesNotThrow(() => assertAllowed(policy, "markDone", { actor: "agent", consent: true }));
  });

  it("rejects agent branch deletion under balanced and protects base", () => {
    const repo = makeRepo();
    repos.push(repo);
    initProject(repo, "Harbor", "studio");
    runGit(repo, ["branch", "feature/tmp"]);
    assert.throws(() => deleteBranch(repo, "feature/tmp", false, { actor: "agent" }), /不在清单里/);
    assert.throws(() => deleteBranch(repo, "main", false, { actor: "human" }), /是基线/);
    deleteBranch(repo, "feature/tmp", false, { actor: "human" }, "feature/tmp");
  });

  it("fills a complete policy when loading an old project.json", () => {
    const repo = makeRepo();
    repos.push(repo);
    initProject(repo, "Legacy", "studio");
    const raw = JSON.parse(readFileSync(projectFile(repo), "utf8"));
    delete raw.policy;
    writeFileSync(projectFile(repo), `${JSON.stringify(raw, null, 2)}\n`);
    const loaded = loadProject(repo);
    assert.ok(loaded?.policy);
    assert.equal(loaded.policy.version, 1);
    assert.equal(loaded.policy.preset, "balanced");
    assert.equal(loaded.policy.agentMay.ingestRaw, "allow");
    assert.equal(loaded.policy.agentMay.deleteBranch, "never");
    assert.equal(loaded.policy.agentMay.markDone, "ask");
    assert.ok(loaded.policy.wiki.gate);
    const persisted = JSON.parse(readFileSync(projectFile(repo), "utf8"));
    assert.ok(persisted.policy);
    assert.equal(persisted.policy.agentMay.createTask, "allow");
  });

  it("speaks Chinese when an agent tries to update policy", () => {
    const repo = makeRepo();
    repos.push(repo);
    initProject(repo, "AgentPolicy", "studio");
    const before = JSON.stringify(loadProject(repo)!.policy);
    assert.equal(humanRejectReason("policy"), "只有人能改谁能做什么。");
    assert.throws(() => updatePolicy(repo, { preset: "locked" }), (err: unknown) => {
      assert.ok(err instanceof PolicyError);
      assert.equal(err.code, "never");
      assert.equal(err.message, humanRejectReason("policy"));
      assert.equal(err.message.includes("Only a human"), false);
      return true;
    });
    assert.equal(JSON.stringify(loadProject(repo)!.policy), before);
  });

  it("lets a human create a task that an agent could also create under balanced", () => {
    const repo = makeRepo();
    repos.push(repo);
    initProject(repo, "Harbor", "studio");
    const { task } = createTask(repo, { title: "policy-task", allowedPaths: ["app/**"] }, { actor: "human" });
    assert.equal(task.slug, "policy-task");
    assert.throws(() => markDone(repo, task.id), (err: unknown) => {
      assert.ok(err instanceof PolicyError);
      assert.equal(err.code, "ask");
      return true;
    });
  });
});
