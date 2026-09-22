import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { checkoutRejectReason, GuardError, guardRejectReason, resolveGovernedRoot } from "../src/guard.ts";
import { runGit } from "../src/git.ts";
import { createTask, guardStaged, initProject } from "../src/service.ts";

const HOME = mkdtempSync(join(tmpdir(), "guard-home-"));
process.env.LATTICE_HOME = HOME;
const HUMAN = { actor: "human" as const };
const repos: string[] = [];

after(() => {
  rmSync(HOME, { recursive: true, force: true });
  for (const repo of repos) rmSync(repo, { recursive: true, force: true });
});

function makeRepo(): string {
  const root = mkdtempSync(join(tmpdir(), "guard-repo-"));
  runGit(root, ["init", "-b", "main"]);
  runGit(root, ["config", "user.email", "guard@test.local"]);
  runGit(root, ["config", "user.name", "Guard"]);
  mkdirSync(join(root, "app"), { recursive: true });
  writeFileSync(join(root, "app", "page.tsx"), "export default function Page() { return null }\n");
  writeFileSync(join(root, "README.md"), "# demo\n");
  runGit(root, ["add", "."]);
  runGit(root, ["commit", "-m", "init"]);
  return root;
}

function fixture(name = "Guard"): string {
  const repo = makeRepo();
  repos.push(repo);
  initProject(repo, name, "studio");
  return repo;
}

describe("guard hook", () => {
  it("installs a pre-commit hook that calls workzoon guard", () => {
    const repo = fixture("Hook");
    const hook = join(repo, ".git", "hooks", "pre-commit");
    assert.equal(existsSync(hook), true);
    const body = readFileSync(hook, "utf8");
    assert.match(body, /workzoon-guard/);
    assert.match(body, /guard --staged/);
  });

  it("speaks Chinese when the checkout has no Workzoon project", () => {
    const repo = makeRepo();
    repos.push(repo);
    assert.match(checkoutRejectReason(repo), /还没有工区/);
    assert.throws(() => resolveGovernedRoot(repo), (err: unknown) => {
      assert.equal((err as Error).message, checkoutRejectReason(repo));
      assert.equal((err as Error).message.includes("Workzoon"), false);
      return true;
    });
    assert.throws(() => guardStaged(repo), (err: unknown) => {
      assert.equal((err as Error).message, checkoutRejectReason(repo));
      return true;
    });
  });

  it("blocks a staged do-not-touch file", () => {
    const repo = fixture("Forbidden");
    writeFileSync(join(repo, ".env"), "SECRET=1\n");
    runGit(repo, ["add", ".env"]);
    assert.throws(() => guardStaged(repo), (err: unknown) => {
      assert.ok(err instanceof GuardError);
      assert.equal(err.message, guardRejectReason(".env", "forbidden / do-not-touch"));
      assert.equal(err.message.includes("guard blocked"), false);
      assert.equal(err.result.verdict, "blocked");
      assert.equal(err.result.findings[0]?.reason, "forbidden / do-not-touch");
      assert.equal(err.result.files.includes(".env"), true);
      return true;
    });
  });

  it("lets LATTICE_OVERRIDE=1 through and writes the ledger", () => {
    const repo = fixture("Override");
    writeFileSync(join(repo, ".env"), "SECRET=1\n");
    runGit(repo, ["add", ".env"]);
    const prev = process.env.LATTICE_OVERRIDE;
    process.env.LATTICE_OVERRIDE = "1";
    try {
      const result = guardStaged(repo);
      assert.equal(result.ok, true);
      assert.equal(result.overridden, true);
      assert.match(readFileSync(join(repo, ".lattice", "ledger.md"), "utf8"), /guard\.override/);
    } finally {
      if (prev === undefined) delete process.env.LATTICE_OVERRIDE;
      else process.env.LATTICE_OVERRIDE = prev;
    }
  });

  it("allows a staged file inside the task allowedPaths", () => {
    const repo = fixture("Allowed");
    const { task } = createTask(repo, { title: "guard allow", allowedPaths: ["app/**"] }, HUMAN);
    writeFileSync(join(repo, "app", "extra.tsx"), "export const extra = 1\n");
    runGit(repo, ["add", "app/extra.tsx"]);
    const result = guardStaged(repo, { taskId: task.id });
    assert.equal(result.ok, true);
    assert.equal(result.overridden, false);
    assert.equal(result.verdict, "ok");
  });

  it("blocks a frozen layer even when the path is staged on the task", () => {
    const repo = fixture("Frozen");
    const { task } = createTask(repo, { title: "guard freeze", allowedPaths: ["package.json", "app/**"] }, HUMAN);
    writeFileSync(join(repo, "package.json"), "{\"name\":\"nope\"}\n");
    runGit(repo, ["add", "package.json"]);
    assert.throws(() => guardStaged(repo, { taskId: task.id }), (err: unknown) => {
      assert.ok(err instanceof GuardError);
      assert.match(err.message, /冻结层/);
      assert.equal(err.message.includes("frozen layer"), false);
      assert.match(err.result.findings[0]?.reason || "", /frozen layer/);
      return true;
    });
  });
});
