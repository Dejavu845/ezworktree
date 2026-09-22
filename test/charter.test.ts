import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { checkBlast } from "../src/blast.ts";
import { nextCharterVersion } from "../src/charter.ts";
import { runGit } from "../src/git.ts";
import { charterRejectReason, createTask, generateHandoff, initProject, updateCharter, updatePolicy } from "../src/service.ts";
import { loadProject, projectFile } from "../src/store.ts";

const HOME = mkdtempSync(join(tmpdir(), "charter-home-"));
process.env.LATTICE_HOME = HOME;
const HUMAN = { actor: "human" as const };
const AGENT = { actor: "agent" as const, agent: "cursor", consent: true };
const repos: string[] = [];

after(() => {
  rmSync(HOME, { recursive: true, force: true });
  for (const repo of repos) rmSync(repo, { recursive: true, force: true });
});

function makeRepo(): string {
  const root = mkdtempSync(join(tmpdir(), "charter-repo-"));
  runGit(root, ["init", "-b", "main"]);
  runGit(root, ["config", "user.email", "charter@test.local"]);
  runGit(root, ["config", "user.name", "Charter"]);
  mkdirSync(join(root, "app"), { recursive: true });
  writeFileSync(join(root, "app", "page.tsx"), "export default function Page() { return null }\n");
  writeFileSync(join(root, "README.md"), "# demo\n");
  runGit(root, ["add", "."]);
  runGit(root, ["commit", "-m", "init"]);
  return root;
}

function fixture(name = "Charter"): string {
  const repo = makeRepo();
  repos.push(repo);
  initProject(repo, name, "studio");
  return repo;
}

describe("charter version", () => {
  it("starts at 1 and writes Version into charter.md", () => {
    const repo = fixture("V1");
    const project = loadProject(repo);
    assert.equal(project?.charter.version, 1);
    assert.match(readFileSync(join(repo, ".lattice", "charter.md"), "utf8"), /^Version: 1$/m);
    const disk = JSON.parse(readFileSync(projectFile(repo), "utf8"));
    assert.equal(disk.charter.version, 1);
    assert.match(project?.charter.purpose || "", /\u6309\u4e00\u4efd\u56fa\u5b9a\u5baa\u7ae0/);
    assert.equal((project?.charter.purpose || "").includes("fixed framework"), false);
    assert.match(project?.charter.conventions.join("\n") || "", /\u5148\u5199\u4ea4\u63a5/);
  });

  it("fills missing version on load and ignores a caller-supplied number", () => {
    const repo = fixture("Legacy");
    const raw = JSON.parse(readFileSync(projectFile(repo), "utf8"));
    delete raw.charter.version;
    writeFileSync(projectFile(repo), `${JSON.stringify(raw, null, 2)}\n`);
    const loaded = loadProject(repo);
    assert.equal(loaded?.charter.version, 1);
    assert.equal(JSON.parse(readFileSync(projectFile(repo), "utf8")).charter.version, 1);
    const bumped = updateCharter(
      repo,
      { ...loaded!.charter, version: 99, conventions: [...loaded!.charter.conventions, "new rule"] },
      HUMAN,
    );
    assert.equal(bumped.charter.version, 2);
    assert.equal(nextCharterVersion(loaded!.charter, loaded!.charter), 1);
  });

  it("stamps blast and handoff with the live charter version", () => {
    const repo = fixture("Stamp");
    const project = loadProject(repo)!;
    const { task } = createTask(repo, { title: "stamp charter", allowedPaths: ["app/**"] }, HUMAN);
    updateCharter(repo, { ...project.charter, conventions: [...project.charter.conventions, "stamp"] }, HUMAN);
    const live = loadProject(repo)!;
    assert.equal(live.charter.version, 2);
    const report = checkBlast(live, live.tasks.find((item) => item.id === task.id)!, ["app/page.tsx"]);
    assert.equal(report.charterVersion, 2);
    const { markdown } = generateHandoff(repo, task.id);
    assert.match(markdown, /Charter: v2/);
    assert.match(readFileSync(join(repo, ".lattice", "charter.md"), "utf8"), /^Version: 2$/m);
  });

  it("speaks Chinese when an agent overreaches the charter", () => {
    const repo = fixture("AgentCharter");
    updatePolicy(repo, { preset: "open" }, HUMAN);
    const project = loadProject(repo)!;
    const disk = () => readFileSync(join(repo, ".lattice", "charter.md"), "utf8");
    const before = disk();
    const jsonBefore = readFileSync(projectFile(repo), "utf8");
    assert.equal(charterRejectReason("scope"), "Agent \u53ea\u80fd\u6539\u5e72\u6d3b\u7684\u89c4\u77e9\uff0c\u6216\u52a0\u4e00\u5c42\u3002\u8fd9\u9879\u76ee\u8981\u505a\u4ec0\u4e48\u3001\u600e\u4e48\u642d\uff0c\u8bf7\u4f60\u6765\u5199\u3002");
    assert.throws(() => updateCharter(repo, { ...project.charter, purpose: "rewrite the product" }, AGENT), (err: unknown) => {
      assert.equal((err as Error).message, charterRejectReason("scope"));
      assert.equal((err as Error).message.includes("conventions"), false);
      return true;
    });
    assert.throws(
      () => updateCharter(repo, { ...project.charter, doNotTouch: project.charter.doNotTouch.filter((item) => item !== ".env") }, AGENT),
      (err: unknown) => {
        assert.equal((err as Error).message, charterRejectReason("touch"));
        assert.equal((err as Error).message.includes("doNotTouch"), false);
        return true;
      },
    );
    assert.throws(
      () => updateCharter(repo, { ...project.charter, layers: project.charter.layers.filter((layer) => layer.id !== "content") }, AGENT),
      (err: unknown) => {
        assert.equal((err as Error).message, charterRejectReason("remove"));
        return true;
      },
    );
    assert.throws(
      () =>
        updateCharter(
          repo,
          {
            ...project.charter,
            layers: project.charter.layers.map((layer) => (layer.id === "foundation" ? { ...layer, frozen: false } : layer)),
          },
          AGENT,
        ),
      (err: unknown) => {
        assert.equal((err as Error).message, charterRejectReason("unfreeze"));
        assert.equal((err as Error).message.includes("unfreeze"), false);
        return true;
      },
    );
    assert.equal(disk(), before);
    assert.equal(readFileSync(projectFile(repo), "utf8"), jsonBefore);
  });
});
