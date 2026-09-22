import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { inventory, pinId, pinMissingRejectReason } from "../src/artifacts.ts";
import { changedFiles, runGit } from "../src/git.ts";
import { PolicyError } from "../src/policy.ts";
import {
  humanRejectReason,
  initProject,
  listArtifacts,
  pinNameRejectReason,
  pinUnpinRejectReason,
  pinProjectArtifact,
  projectHoldings,
  projectLedger,
  unpinProjectArtifact,
} from "../src/service.ts";

const HOME = mkdtempSync(join(tmpdir(), "artifacts-home-"));
process.env.LATTICE_HOME = HOME;

function makeRepo(): string {
  const root = mkdtempSync(join(tmpdir(), "artifacts-repo-"));
  runGit(root, ["init", "-b", "main"]);
  runGit(root, ["config", "user.email", "artifacts@test.local"]);
  runGit(root, ["config", "user.name", "Artifacts"]);
  mkdirSync(join(root, "app"), { recursive: true });
  writeFileSync(join(root, "app", "page.tsx"), "export default function Page() { return null }\n");
  writeFileSync(join(root, "README.md"), "# demo\n");
  runGit(root, ["add", "."]);
  runGit(root, ["commit", "-m", "init"]);
  return root;
}

function writeOut(root: string, body = "<html></html>\n"): void {
  mkdirSync(join(root, "out"), { recursive: true });
  writeFileSync(join(root, "out", "index.html"), body);
}

const HUMAN = { actor: "human" as const };
const repos: string[] = [];

after(() => {
  rmSync(HOME, { recursive: true, force: true });
  for (const repo of repos) rmSync(repo, { recursive: true, force: true });
});

describe("artifact version pins", () => {
  it("derives a stable id from sha12, safe name, and contentHash8", () => {
    const sha = "abcdef0123456789ffff0000aaaa1111bbbb2222";
    assert.equal(pinId(sha, "out", "0123456789abcdef"), "abcdef012345-out-01234567");
    assert.equal(pinId(sha, "out/dist!", "ff".repeat(32)), `${sha.slice(0, 12)}-out-dist-${"ff".repeat(4)}`);
  });

  it("hashes inventory by path and byte size, not file contents", () => {
    const dir = mkdtempSync(join(tmpdir(), "inv-"));
    writeFileSync(join(dir, "a.txt"), "hello");
    const first = inventory(dir, "dir");
    writeFileSync(join(dir, "a.txt"), "hallo");
    const sameSize = inventory(dir, "dir");
    writeFileSync(join(dir, "a.txt"), "hello!");
    const grown = inventory(dir, "dir");
    rmSync(dir, { recursive: true, force: true });
    assert.equal(first.contentHash, sameSize.contentHash);
    assert.notEqual(first.contentHash, grown.contentHash);
    assert.equal(first.partial, false);
    assert.equal(first.files, 1);
  });

  it("pins a record on the current branch without copying bytes", () => {
    const repo = makeRepo();
    repos.push(repo);
    initProject(repo, "Pins", "studio");
    writeOut(repo);
    const sha = runGit(repo, ["rev-parse", "HEAD"]);
    const result = pinProjectArtifact(repo, { name: "out", note: "  first   build  " }, HUMAN);
    assert.equal(result.created, true);
    const version = result.version;
    assert.equal(version.id, pinId(sha, "out", version.contentHash));
    assert.equal(version.name, "out");
    assert.equal(version.kind, "dir");
    assert.equal(version.branch, "main");
    assert.equal(version.sha, sha);
    assert.equal(typeof version.dirty, "boolean");
    assert.equal(version.path, join(repo, "out"));
    assert.equal(version.checkout, repo);
    assert.equal(version.files, 1);
    assert.ok(version.bytes > 0);
    assert.equal(version.note, "first build");
    assert.equal(version.pinnedBy.actor, "human");
    assert.equal(version.partial, undefined);
    assert.match(version.builtAt, /^\d{4}-/);
    assert.match(version.pinnedAt, /^\d{4}-/);
    const dest = join(repo, ".lattice", "artifacts", "main", `${version.id}.json`);
    assert.equal(existsSync(dest), true);
    const raw = readFileSync(dest, "utf8");
    assert.doesNotMatch(raw, /<html>/);
    assert.equal(existsSync(join(repo, "out", "index.html")), true);
    const listed = listArtifacts(repo);
    assert.equal(listed.versions.length, 1);
    assert.equal(listed.versions[0].state, "present");
    assert.equal(listed.versions[0].onBranch, true);
    assert.equal(listed.versions[0].behind, 0);
    assert.equal(listed.artifacts.find((item) => item.name === "out")?.pinnedId, version.id);
    assert.equal(listed.artifacts.find((item) => item.name === "out")?.sha, sha);
  });

  it("is idempotent for the same sha, name, and contentHash", () => {
    const repo = makeRepo();
    repos.push(repo);
    initProject(repo, "Idempotent", "studio");
    writeOut(repo);
    const first = pinProjectArtifact(repo, { name: "out" }, HUMAN);
    const second = pinProjectArtifact(repo, { name: "out" }, HUMAN);
    assert.equal(second.created, false);
    assert.equal(second.version.id, first.version.id);
    const folder = join(repo, ".lattice", "artifacts", "main");
    assert.deepEqual(
      readdirSync(folder).filter((name) => name.endsWith(".json")),
      [`${first.version.id}.json`],
    );
    assert.match(projectLedger(repo), /human \| pinArtifact \| .+ \| exists/);
  });

  it("opens a new pin when the inventory size changes", () => {
    const repo = makeRepo();
    repos.push(repo);
    initProject(repo, "Touch", "studio");
    writeOut(repo);
    const first = pinProjectArtifact(repo, { name: "out" }, HUMAN);
    writeOut(repo, "<html>changed</html>\n");
    const second = pinProjectArtifact(repo, { name: "out" }, HUMAN);
    assert.equal(second.created, true);
    assert.notEqual(second.version.id, first.version.id);
    assert.notEqual(second.version.contentHash, first.version.contentHash);
    assert.equal(listArtifacts(repo).versions.length, 2);
  });

  it("records dirty when the checkout has uncommitted edits", () => {
    const repo = makeRepo();
    repos.push(repo);
    initProject(repo, "Dirty", "studio");
    writeOut(repo);
    writeFileSync(join(repo, "README.md"), "# dirty\n");
    const result = pinProjectArtifact(repo, { name: "out" }, HUMAN);
    assert.equal(result.version.dirty, true);
  });

  it("marks a pin changed then missing when the live artifact moves", () => {
    const repo = makeRepo();
    repos.push(repo);
    initProject(repo, "States", "studio");
    writeOut(repo);
    pinProjectArtifact(repo, { name: "out" }, HUMAN);
    writeOut(repo, "<html>bigger</html>\n");
    assert.equal(listArtifacts(repo).versions[0].state, "changed");
    rmSync(join(repo, "out"), { recursive: true, force: true });
    assert.equal(listArtifacts(repo).versions[0].state, "missing");
  });

  it("rejects an agent pin with 403 semantics and a denied ledger line", () => {
    const repo = makeRepo();
    repos.push(repo);
    initProject(repo, "AgentDeny", "studio");
    writeOut(repo);
    assert.throws(() => pinProjectArtifact(repo, { name: "out" }), (err: unknown) => {
      assert.ok(err instanceof PolicyError);
      assert.equal(err.code, "never");
      assert.equal(err.message, humanRejectReason("pin"));
      assert.equal(err.message.includes("Only a human"), false);
      return true;
    });
    assert.equal(existsSync(join(repo, ".lattice", "artifacts")), false);
    assert.match(projectLedger(repo), /agent \| pinArtifact \| out \| denied/);
    assert.throws(() => unpinProjectArtifact(repo, "missing"), (err: unknown) => {
      assert.ok(err instanceof PolicyError);
      assert.equal(err.message, humanRejectReason("unpin"));
      return true;
    });
    assert.match(projectLedger(repo), /agent \| unpinArtifact \| missing \| denied/);
  });

  it("speaks Chinese when the artifact name is empty", () => {
    const repo = makeRepo();
    repos.push(repo);
    initProject(repo, "EmptyPin", "studio");
    assert.equal(pinNameRejectReason(), "还没写要钉的产物名。");
    assert.throws(() => pinProjectArtifact(repo, { name: "   " }, HUMAN), (err: unknown) => {
      assert.equal((err as Error).message, pinNameRejectReason());
      assert.equal((err as Error).message.includes("Artifact name is required"), false);
      return true;
    });
    assert.equal(existsSync(join(repo, ".lattice", "artifacts")), false);
  });

  it("speaks Chinese when the artifact path is missing", () => {
    const repo = makeRepo();
    repos.push(repo);
    initProject(repo, "MissingPin", "studio");
    assert.equal(pinMissingRejectReason("ghost-out"), "找不到「ghost-out」。换一个仓里已经有的文件或文件夹。");
    assert.throws(() => pinProjectArtifact(repo, { name: "ghost-out" }, HUMAN), (err: unknown) => {
      assert.equal((err as Error).message, pinMissingRejectReason("ghost-out"));
      assert.equal((err as Error).message.includes("Artifact not found"), false);
      return true;
    });
    assert.equal(existsSync(join(repo, ".lattice", "artifacts")), false);
  });

  it("speaks Chinese when unpin has no id or the pin is missing", () => {
    const repo = makeRepo();
    repos.push(repo);
    initProject(repo, "EmptyUnpin", "studio");
    assert.equal(pinUnpinRejectReason("empty"), "还没写要卸的钉。");
    assert.throws(() => unpinProjectArtifact(repo, "   ", HUMAN), (err: unknown) => {
      assert.equal((err as Error).message, pinUnpinRejectReason("empty"));
      return true;
    });
    assert.throws(() => unpinProjectArtifact(repo, "ghost-pin", HUMAN), (err: unknown) => {
      assert.equal((err as Error).message, pinUnpinRejectReason("missing", "ghost-pin"));
      assert.equal((err as Error).message.includes("Pin not found"), false);
      return true;
    });
  });

  it("unpins by deleting the record and writing the ledger", () => {
    const repo = makeRepo();
    repos.push(repo);
    initProject(repo, "Unpin", "studio");
    writeOut(repo);
    const pinned = pinProjectArtifact(repo, { name: "out" }, HUMAN);
    const dest = join(repo, ".lattice", "artifacts", "main", `${pinned.version.id}.json`);
    const removed = unpinProjectArtifact(repo, pinned.version.id, HUMAN);
    assert.equal(removed.version.id, pinned.version.id);
    assert.equal(existsSync(dest), false);
    assert.equal(listArtifacts(repo).versions.length, 0);
    assert.match(projectLedger(repo), /human \| unpinArtifact \| .+ \| ok/);
  });

  it("writes HOLDINGS with @sha12 and a 版本 section", () => {
    const repo = makeRepo();
    repos.push(repo);
    initProject(repo, "HoldingsPin", "studio");
    writeOut(repo);
    const pinned = pinProjectArtifact(repo, { name: "out" }, HUMAN);
    const sha12 = pinned.version.sha.slice(0, 12);
    const holdings = projectHoldings(repo);
    assert.match(holdings.markdown, new RegExp(`on \\\`main\\\` @${sha12}`));
    assert.match(holdings.markdown, /钉 1 版/);
    assert.match(holdings.markdown, /## 版本/);
    assert.match(holdings.markdown, new RegExp(`\\\`out\\\` @${sha12} · present`));
    const wiki = readFileSync(join(repo, ".lattice", "wiki", "entities", "artifacts.md"), "utf8");
    assert.match(wiki, /## 版本/);
    assert.match(wiki, new RegExp(pinned.version.id));
  });

  it("keeps pin records out of blast changedFiles", () => {
    const repo = makeRepo();
    repos.push(repo);
    initProject(repo, "HiddenPins", "studio");
    writeOut(repo);
    const pinned = pinProjectArtifact(repo, { name: "out" }, HUMAN);
    const rel = `.lattice/artifacts/main/${pinned.version.id}.json`;
    runGit(repo, ["add", "-f", rel]);
    writeFileSync(join(repo, "app", "page.tsx"), "export default function Page() { return 1 }\n");
    const files = changedFiles(repo, "main");
    assert.ok(files.includes("app/page.tsx"));
    assert.ok(!files.some((item) => item.startsWith(".lattice/artifacts/")));
  });
});
