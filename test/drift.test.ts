import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { blockHash, detectDrift, driftOf } from "../src/drift.ts";
import { runGit } from "../src/git.ts";
import { PolicyError } from "../src/policy.ts";
import { humanRejectReason, initProject, projectLedger, snapshotWithMaps, syncAgents, updateCharter } from "../src/service.ts";

const HOME = mkdtempSync(join(tmpdir(), "drift-home-"));
process.env.LATTICE_HOME = HOME;

function makeRepo(): string {
  const root = mkdtempSync(join(tmpdir(), "drift-repo-"));
  runGit(root, ["init", "-b", "main"]);
  runGit(root, ["config", "user.email", "drift@test.local"]);
  runGit(root, ["config", "user.name", "Drift"]);
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

describe("AGENTS.md managed-block drift", () => {
  it("is clean after init and writes a 12-hex BEGIN marker", () => {
    const repo = makeRepo();
    repos.push(repo);
    const project = initProject(repo, "DriftClean", "studio");
    assert.deepEqual(detectDrift(project), []);
    const agents = readFileSync(join(repo, "AGENTS.md"), "utf8");
    assert.match(agents, /<!-- lattice:begin sha256=[0-9a-f]{12} -->/);
    const snap = snapshotWithMaps();
    assert.deepEqual(snap.drift.find((item) => item.rootPath === repo)?.items, []);
  });

  it("keeps an edited block read-only across snapshot and charter updates", () => {
    const repo = makeRepo();
    repos.push(repo);
    const project = initProject(repo, "DriftEdited", "studio");
    const agentsPath = join(repo, "AGENTS.md");
    const original = readFileSync(agentsPath, "utf8");
    writeFileSync(
      agentsPath,
      original.replace(/(<!-- lattice:begin sha256=[0-9a-f]{12} -->\n)/, "$1human-keep\n"),
    );
    const drift = detectDrift(project);
    assert.equal(drift.length, 1);
    assert.equal(drift[0].file, "AGENTS.md");
    assert.equal(drift[0].kind, "edited");
    const bytes = readFileSync(agentsPath);
    snapshotWithMaps();
    snapshotWithMaps();
    assert.deepEqual(readFileSync(agentsPath), bytes);
    updateCharter(repo, { ...project.charter, conventions: [...project.charter.conventions, "extra"] }, { actor: "human" });
    const after = readFileSync(agentsPath, "utf8");
    assert.match(after, /human-keep/);
    assert.equal(detectDrift(project)[0]?.kind, "edited");
  });

  it("treats old markers as stale and lets a human sync keep outer text", () => {
    const repo = makeRepo();
    repos.push(repo);
    const project = initProject(repo, "DriftStale", "studio");
    writeFileSync(
      join(repo, "AGENTS.md"),
      "# Mine\nkeep-top\n\n<!-- lattice:begin -->\nold\n<!-- lattice:end -->\n\n## Tail\nkeep-bottom\n",
    );
    assert.equal(detectDrift(project)[0]?.kind, "stale");
    const result = syncAgents(repo, { actor: "human" });
    assert.deepEqual(result.drift, []);
    assert.deepEqual(detectDrift(project), []);
    const agents = readFileSync(join(repo, "AGENTS.md"), "utf8");
    assert.match(agents, /<!-- lattice:begin sha256=[0-9a-f]{12} -->/);
    assert.match(agents, /keep-top/);
    assert.match(agents, /keep-bottom/);
    assert.doesNotMatch(agents, /\nold\n/);
    assert.match(projectLedger(repo), /human \| syncAgents \| AGENTS.md \| stale/);
  });

  it("locks agent sync on missing AGENTS.md and lets a human restore it", () => {
    const repo = makeRepo();
    repos.push(repo);
    const project = initProject(repo, "DriftMissing", "studio");
    rmSync(join(repo, "AGENTS.md"));
    assert.equal(detectDrift(project)[0]?.kind, "missing");
    assert.throws(() => syncAgents(repo), (err: unknown) => {
      assert.ok(err instanceof PolicyError);
      assert.equal(err.code, "never");
      assert.equal(err.message, humanRejectReason("sync"));
      assert.equal(err.message.includes("Only a human"), false);
      return true;
    });
    assert.equal(existsSync(join(repo, "AGENTS.md")), false);
    const result = syncAgents(repo, { actor: "human" });
    assert.ok(existsSync(join(repo, "AGENTS.md")));
    assert.deepEqual(result.drift, []);
    assert.deepEqual(detectDrift(project), []);
  });

  it("hashes and classifies text as pure functions", () => {
    assert.equal(driftOf(null)?.kind, "missing");
    assert.equal(driftOf("# x\n")?.kind, "missing");
    assert.equal(blockHash("a\r\nb\n"), blockHash("a\nb"));
  });
});
