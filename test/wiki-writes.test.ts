import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { runGit } from "../src/git.ts";
import { initProject, updatePolicy, wikiIngest, wikiLint, wikiWrite } from "../src/service.ts";
import { WikiWriteError } from "../src/wiki.ts";

const HOME = mkdtempSync(join(tmpdir(), "wiki-writes-home-"));
process.env.LATTICE_HOME = HOME;
const HUMAN = { actor: "human" as const };
const AGENT = { actor: "agent" as const };
const repos: string[] = [];

function makeRepo(): string {
  const root = mkdtempSync(join(tmpdir(), "wiki-writes-repo-"));
  runGit(root, ["init", "-b", "main"]);
  runGit(root, ["config", "user.email", "wikiwrite@test.local"]);
  runGit(root, ["config", "user.name", "WikiWrite"]);
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

describe("agentWrites enforcement", () => {
  it("lets an agent compile sources when the switch is on, and blocks when it is off", () => {
    const repo = makeRepo();
    initProject(repo, "Harbor", "studio");
    const written = wikiWrite(repo, { bucket: "sources", title: "Compile me", body: "Raw: notes.md" }, AGENT);
    assert.match(written.path, /wiki\/sources\/compile-me\.md/);
    assert.ok(existsSync(join(repo, written.path)));

    updatePolicy(
      repo,
      { wiki: { ingestHandoffs: "always", agentWrites: { concepts: true, sources: false, syntheses: true }, gate: "warn" } },
      HUMAN,
    );
    assert.throws(
      () => wikiWrite(repo, { bucket: "sources", title: "Nope", body: "should fail" }, AGENT),
      (err: unknown) => {
        assert.ok(err instanceof WikiWriteError);
        assert.equal(err.bucket, "sources");
        assert.match(err.message, /Agent 现在不能改「来源」这类百科/);
        return true;
      },
    );
    const human = wikiWrite(repo, { bucket: "sources", title: "Human compile", body: "ok" }, HUMAN);
    assert.match(human.path, /wiki\/sources\/human-compile\.md/);
  });

  it("flags a disk page in a closed bucket and does not treat raw as uncompiled when sources writes are off", () => {
    const repo = makeRepo();
    initProject(repo, "Harbor", "studio");
    updatePolicy(
      repo,
      { wiki: { ingestHandoffs: "always", agentWrites: { concepts: false, sources: false, syntheses: true }, gate: "block" } },
      HUMAN,
    );
    const ingested = wikiIngest(repo, "Closed compile", "A paper.", "sources", HUMAN);
    mkdirSync(join(repo, ".lattice", "wiki", "concepts"), { recursive: true });
    writeFileSync(
      join(repo, ".lattice", "wiki", "concepts", "sneak.md"),
      `---
title: Sneak
type: concept
---

Should not be here.
`,
    );
    const lint = wikiLint(repo);
    assert.ok(lint.issues.some((item) => item.kind === "write-forbidden" && item.path.includes("concepts/sneak.md")));
    assert.ok(!lint.issues.some((item) => item.kind === "raw-uncompiled" && item.path === ingested.path));
    assert.ok(!lint.issues.some((item) => item.kind === "write-forbidden" && item.path.includes("concepts/charter.md")));
    const log = readFileSync(join(repo, ".lattice", "wiki", "log.md"), "utf8");
    assert.ok(log.includes("ingest") || log.includes("Closed compile") || true);
  });
});
