import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { runGit } from "../src/git.ts";
import { createTask, initProject, initRejectReason, listArtifacts, openWorktree, projectRejectReason, sourceList } from "../src/service.ts";
import { sourceRejectReason } from "../src/map.ts";
import { taskMissingRejectReason } from "../src/lane.ts";
import { catalogPath, loadCatalog, loadProject, projectFile, rootPathRejectReason, saveProject } from "../src/store.ts";

const HOME = mkdtempSync(join(tmpdir(), "store-home-"));
process.env.LATTICE_HOME = HOME;
const HUMAN = { actor: "human" as const };
const repos: string[] = [];

after(() => {
  rmSync(HOME, { recursive: true, force: true });
  for (const repo of repos) rmSync(repo, { recursive: true, force: true });
});

function makeRepo(): string {
  const root = mkdtempSync(join(tmpdir(), "store-repo-"));
  runGit(root, ["init", "-b", "main"]);
  runGit(root, ["config", "user.email", "store@test.local"]);
  runGit(root, ["config", "user.name", "Store"]);
  mkdirSync(join(root, "app"), { recursive: true });
  writeFileSync(join(root, "app", "page.tsx"), "export default function Page() { return null }\n");
  writeFileSync(join(root, "README.md"), "# demo\n");
  runGit(root, ["add", "."]);
  runGit(root, ["commit", "-m", "init"]);
  return root;
}

function fixture(name = "Store"): string {
  const repo = makeRepo();
  repos.push(repo);
  initProject(repo, name, "studio");
  return repo;
}

describe("project.json has no machine rootPath", () => {
  it("omits rootPath on disk and hydrates it from the load path", () => {
    const repo = fixture("Hydrate");
    const disk = JSON.parse(readFileSync(projectFile(repo), "utf8"));
    assert.equal(Object.hasOwn(disk, "rootPath"), false);
    const loaded = loadProject(repo);
    assert.equal(loaded?.rootPath, repo);
    assert.equal(loaded?.name, "Hydrate");
    const catalog = JSON.parse(readFileSync(catalogPath(), "utf8"));
    const entry = catalog.projects.find((item: { name: string }) => item.name === "Hydrate");
    assert.equal(entry.rootPath, repo);
    assert.equal(loadCatalog().projects.find((item) => item.name === "Hydrate")?.rootPath, repo);
  });

  it("ignores a stale disk rootPath and strips it on load", () => {
    const repo = fixture("Stale");
    const raw = JSON.parse(readFileSync(projectFile(repo), "utf8"));
    raw.rootPath = "/old/machine/path/Harbor";
    writeFileSync(projectFile(repo), `${JSON.stringify(raw, null, 2)}\n`);
    const loaded = loadProject(repo);
    assert.equal(loaded?.rootPath, repo);
    const disk = JSON.parse(readFileSync(projectFile(repo), "utf8"));
    assert.equal(Object.hasOwn(disk, "rootPath"), false);
    createTask(repo, { title: "keep hydrated", allowedPaths: ["app/**"] }, HUMAN);
    const again = JSON.parse(readFileSync(projectFile(repo), "utf8"));
    assert.equal(Object.hasOwn(again, "rootPath"), false);
  });

  it("speaks Chinese when the path is not a git repo", () => {
    const bare = mkdtempSync(join(tmpdir(), "store-bare-"));
    repos.push(bare);
    assert.match(initRejectReason(bare), /还不是代码仓库/);
    assert.throws(() => initProject(bare, "Nope"), (err: unknown) => {
      assert.equal((err as Error).message, initRejectReason(bare));
      assert.equal((err as Error).message.includes("is not a git"), false);
      return true;
    });
  });

  it("speaks Chinese when the git repo has no Workzoon project", () => {
    const repo = makeRepo();
    repos.push(repo);
    assert.match(projectRejectReason(repo), /还没有工区/);
    assert.throws(() => listArtifacts(repo), (err: unknown) => {
      assert.equal((err as Error).message, projectRejectReason(repo));
      assert.equal((err as Error).message.includes("not initialized"), false);
      return true;
    });
  });

  it("speaks Chinese when the task id is missing", () => {
    const repo = fixture();
    assert.match(taskMissingRejectReason("ghost-task"), /找不到任务/);
    assert.throws(() => openWorktree(repo, "ghost-task", HUMAN), (err: unknown) => {
      assert.equal((err as Error).message, taskMissingRejectReason("ghost-task"));
      assert.equal((err as Error).message.includes("Unknown task"), false);
      return true;
    });
    assert.throws(() => openWorktree(repo, "   ", HUMAN), (err: unknown) => {
      assert.equal((err as Error).message, taskMissingRejectReason(""));
      return true;
    });
  });

  it("speaks Chinese when a project has no in-memory checkout path", () => {
    const repo = fixture("NoRoot");
    const project = loadProject(repo);
    assert.ok(project);
    const ghost = { ...project, rootPath: "" };
    const before = readFileSync(projectFile(repo), "utf8");
    assert.equal(rootPathRejectReason(), "这张仓还没对上文件夹。从左边重新打开，或先点左下登记仓。");
    assert.throws(() => saveProject(ghost), (err: unknown) => {
      assert.equal((err as Error).message, rootPathRejectReason());
      assert.equal((err as Error).message.includes("rootPath"), false);
      assert.equal((err as Error).message.includes("required"), false);
      return true;
    });
    assert.equal(readFileSync(projectFile(repo), "utf8"), before);
  });

  it("speaks Chinese when a browse path is outside the repo or not a folder", () => {
    const repo = fixture("Browse");
    const before = readFileSync(projectFile(repo), "utf8");
    assert.equal(sourceRejectReason("outside"), "这条路径不在这张仓里。请打开仓里的目录，或这张卡自己的目录。");
    assert.throws(() => sourceList(repo, tmpdir()), (err: unknown) => {
      assert.equal((err as Error).message, sourceRejectReason("outside"));
      assert.equal((err as Error).message.includes("registered"), false);
      return true;
    });
    assert.throws(() => sourceList(repo, join(repo, "README.md")), (err: unknown) => {
      assert.equal((err as Error).message, sourceRejectReason("file"));
      assert.equal((err as Error).message.includes("Not a directory"), false);
      return true;
    });
    assert.equal(readFileSync(projectFile(repo), "utf8"), before);
  });
});
