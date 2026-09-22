import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { runGit } from "../src/git.ts";
import { assertTypedConfirm, confirmRejectReason, typedConfirmOk } from "../src/confirm.ts";
import {
  archiveRejectReason,
  archiveWorktree,
  createTask,
  deleteBranch,
  deleteLiveRejectReason,
  deleteRejectReason,
  initProject,
  openWorktree,
  updateAppSettings,
} from "../src/service.ts";

const HOME = mkdtempSync(join(tmpdir(), "confirm-home-"));
process.env.LATTICE_HOME = HOME;

const HUMAN = { actor: "human" as const };
const repos: string[] = [];

function makeRepo(): string {
  const root = mkdtempSync(join(tmpdir(), "confirm-repo-"));
  runGit(root, ["init", "-b", "main"]);
  runGit(root, ["config", "user.email", "confirm@test.local"]);
  runGit(root, ["config", "user.name", "Confirm"]);
  writeFileSync(join(root, "README.md"), "# demo\n");
  mkdirSync(join(root, "app"), { recursive: true });
  writeFileSync(join(root, "app", "page.tsx"), "export default function Page() { return null }\n");
  runGit(root, ["add", "."]);
  runGit(root, ["commit", "-m", "init"]);
  repos.push(root);
  return root;
}

after(() => {
  rmSync(HOME, { recursive: true, force: true });
  for (const repo of repos) rmSync(repo, { recursive: true, force: true });
});

describe("typed destructive confirm", () => {
  it("requires the exact branch name from a human when the setting is on", () => {
    assert.equal(typedConfirmOk("feat/pay", "feat/pay", true, "human"), true);
    assert.equal(typedConfirmOk("feat/pay", " feat/pay ", true, "human"), true);
    assert.equal(typedConfirmOk("feat/pay", "feat/other", true, "human"), false);
    assert.equal(typedConfirmOk("feat/pay", "", true, "human"), false);
    assert.equal(typedConfirmOk("feat/pay", undefined, true, "human"), false);
    assert.equal(typedConfirmOk("feat/pay", "", false, "human"), true);
    assert.equal(typedConfirmOk("feat/pay", undefined, true, "agent"), true);
    assert.throws(() => assertTypedConfirm("feat/pay", "nope", true, "human"), (err: unknown) => {
      assert.equal((err as Error).message, confirmRejectReason("feat/pay"));
      assert.equal((err as Error).message.includes("Type "), false);
      return true;
    });
  });

  it("blocks human archive and branch delete until the branch name is typed", () => {
    const repo = makeRepo();
    initProject(repo, "Confirm", "studio");
    const { task } = createTask(repo, { title: "pay receipt", allowedPaths: ["app/**"] }, HUMAN);
    const planted = openWorktree(repo, task.id, HUMAN);
    assert.throws(() => archiveWorktree(repo, task.id, false, HUMAN), (err: unknown) => {
      assert.equal((err as Error).message, confirmRejectReason(planted.worktree.branch));
      return true;
    });
    assert.throws(() => archiveWorktree(repo, task.id, false, HUMAN, "wrong"), (err: unknown) => {
      assert.equal((err as Error).message, confirmRejectReason(planted.worktree.branch));
      return true;
    });
    archiveWorktree(repo, task.id, false, HUMAN, planted.worktree.branch);

    runGit(repo, ["branch", "feature/tmp"]);
    assert.throws(() => deleteBranch(repo, "feature/tmp", false, HUMAN), (err: unknown) => {
      assert.equal((err as Error).message, confirmRejectReason("feature/tmp"));
      return true;
    });
    deleteBranch(repo, "feature/tmp", false, HUMAN, "feature/tmp");

    runGit(repo, ["branch", "feature/skip"]);
    updateAppSettings({ confirmDestructive: false });
    deleteBranch(repo, "feature/skip", false, HUMAN);
    updateAppSettings({ confirmDestructive: true });
  });

  it("speaks Chinese when archive has no tree or delete hits a live worktree", () => {
    const repo = makeRepo();
    initProject(repo, "Confirm", "studio");
    const { task: bare } = createTask(repo, { title: "no tree yet", allowedPaths: ["app/**"] }, HUMAN);
    assert.throws(() => archiveWorktree(repo, bare.id, false, HUMAN, "feat/no-tree-yet"), (err: unknown) => {
      assert.equal((err as Error).message, archiveRejectReason());
      assert.equal((err as Error).message.includes("no worktree"), false);
      return true;
    });
    const { task } = createTask(repo, { title: "live tree", allowedPaths: ["app/**"] }, HUMAN);
    const planted = openWorktree(repo, task.id, HUMAN);
    assert.throws(
      () => deleteBranch(repo, planted.worktree.branch, false, HUMAN, planted.worktree.branch),
      (err: unknown) => {
        assert.equal((err as Error).message, deleteLiveRejectReason(planted.worktree.branch));
        assert.equal((err as Error).message.includes("Archive first"), false);
        return true;
      },
    );
  });

  it("speaks Chinese when delete hits base or an unmerged branch", () => {
    const repo = makeRepo();
    initProject(repo, "Confirm", "studio");
    assert.throws(() => deleteBranch(repo, "   ", false, HUMAN), (err: unknown) => {
      assert.equal((err as Error).message, deleteRejectReason("empty"));
      return true;
    });
    assert.throws(() => deleteBranch(repo, "main", false, HUMAN), (err: unknown) => {
      assert.equal((err as Error).message, deleteRejectReason("base", { branch: "main" }));
      assert.equal((err as Error).message.includes("Cannot delete"), false);
      return true;
    });

    const loose = runGit(repo, ["commit-tree", "HEAD^{tree}", "-p", "HEAD", "-m", "loose"]);
    runGit(repo, ["branch", "feat/loose", loose]);
    assert.throws(() => deleteBranch(repo, "feat/loose", false, HUMAN, "feat/loose"), (err: unknown) => {
      assert.equal((err as Error).message, deleteRejectReason("unmerged", { branch: "feat/loose", base: "main" }));
      assert.equal((err as Error).message.includes("pass force"), false);
      return true;
    });
    assert.match(deleteRejectReason("head", { branch: "feat/loose" }), /现在打开/);
    assert.match(deleteRejectReason("unmerged-agent"), /只能由人/);
  });
});
