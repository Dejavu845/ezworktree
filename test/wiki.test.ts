import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { checkBlast } from "../src/blast.ts";
import { changedFiles, runGit } from "../src/git.ts";
import { resolveWikiLink, wikiAutoOpen, wikiPageRejectReason, wikiRawRejectReason, writeWikiPage } from "../src/wiki.ts";
import {
  createTask,
  generateHandoff,
  initProject,
  markDone,
  openWorktree,
  plantBranch,
  projectHoldings,
  projectMap,
  updatePolicy,
  wikiIngest,
  wikiLint,
  wikiList,
  wikiPage,
} from "../src/service.ts";
import { loadProject } from "../src/store.ts";

const HOME = mkdtempSync(join(tmpdir(), "workzoon-home-"));
process.env.LATTICE_HOME = HOME;

function makeRepo(): string {
  const root = mkdtempSync(join(tmpdir(), "workzoon-repo-"));
  runGit(root, ["init", "-b", "main"]);
  runGit(root, ["config", "user.email", "workzoon@test.local"]);
  runGit(root, ["config", "user.name", "Workzoon"]);
  writeFileSync(join(root, "package.json"), "{}\n");
  writeFileSync(join(root, "README.md"), "# demo\n");
  mkdirSync(join(root, "app"), { recursive: true });
  writeFileSync(join(root, "app", "page.tsx"), "export default function Page() { return null }\n");
  runGit(root, ["add", "."]);
  runGit(root, ["commit", "-m", "init"]);
  return root;
}

let repo = "";

before(() => {
  repo = makeRepo();
  initProject(repo, "Harbor", "studio");
});

after(() => {
  rmSync(HOME, { recursive: true, force: true });
  rmSync(repo, { recursive: true, force: true });
});

describe("workzoon wiki and forest", () => {
  it("seeds Karpathy raw/wiki/schema and compiles entity pages", () => {
    assert.ok(existsSync(join(repo, ".lattice", "raw", "sources", "workzoon-charter.md")));
    assert.ok(existsSync(join(repo, ".lattice", "wiki", "index.md")));
    assert.ok(existsSync(join(repo, ".lattice", "wiki", "entities", "repo.md")));
    assert.ok(existsSync(join(repo, ".agents", "skills", "workzoon-wiki", "SKILL.md")));
    const agents = readFileSync(join(repo, "AGENTS.md"), "utf8");
    assert.match(agents, /Agent Workzoon/);
    assert.match(agents, /HOLDINGS\.md/);
    assert.ok(existsSync(join(repo, ".lattice", "HOLDINGS.md")));
    assert.match(readFileSync(join(repo, ".lattice", "HOLDINGS.md"), "utf8"), /workzoon:holdings/);
    const index = readFileSync(join(repo, ".lattice", "wiki", "index.md"), "utf8");
    assert.match(index, /\[\[repo\]\]/);
    assert.match(index, /条分支/);
    assert.match(readFileSync(join(repo, ".lattice", "wiki", "concepts", "charter.md"), "utf8"), /宪章/);
    assert.equal(index.includes("Catalog of compiled"), false);
    const log = readFileSync(join(repo, ".lattice", "wiki", "log.md"), "utf8");
    assert.match(log, /百科日志/);
    assert.equal(log.includes("# Wiki log"), false);
  });

  it("replaces leftover English catalog sentences on the next compile", () => {
    const index = join(repo, ".lattice", "wiki", "index.md");
    const original = readFileSync(index, "utf8");
    writeFileSync(
      index,
      original.replace(
        "先看这一页，再点进去。链接名保持不变，方便对上文件。",
        "Catalog of compiled knowledge. Agents read this first, then drill into pages.",
      ),
    );
    projectMap(repo);
    const next = readFileSync(index, "utf8");
    assert.match(next, /先看这一页/);
    assert.equal(next.includes("Catalog of compiled"), false);
    assert.match(next, /\[\[repo\]\]/);
  });

  it("does not overwrite raw on re-init", () => {
    const raw = join(repo, ".lattice", "raw", "sources", "workzoon-charter.md");
    writeFileSync(raw, "# human note\n");
    initProject(repo, "Harbor", "studio");
    assert.equal(readFileSync(raw, "utf8"), "# human note\n");
  });

  it("maps every local branch including main", () => {
    const map = projectMap(repo);
    assert.ok(map.lanes.some((lane) => lane.branch === "main" && lane.worktreePath === repo));
    assert.equal(map.currentBranch, "main");
  });

  it("keeps Chinese titles in slugs and compiles a task entity", () => {
    const { task } = createTask(repo, { title: "修播放器进度条", allowedPaths: ["app/**"] });
    assert.equal(task.slug, "修播放器进度条");
    assert.ok(existsSync(join(repo, ".lattice", "wiki", "entities", `task-${task.slug}.md`)));
  });

  it("ingests into raw only and lints the wiki", () => {
    const ingested = wikiIngest(repo, "Paper notes", "Attention is useful.", "sources");
    assert.match(ingested.path, /\.lattice\/raw\/sources\//);
    const pages = wikiList(repo, "attention");
    const raw = pages.find((page) => page.layer === "raw");
    assert.ok(raw);
    assert.equal(raw.hit?.field, "body");
    assert.match(raw.hit?.snippet || "", /attention/i);
    assert.equal(wikiList(repo, "attention missing-token-xyz").length, 0);
    const lint = wikiLint(repo);
    assert.ok(lint.pages >= 4);
  });

  it("keeps Chinese ingest dests apart and speaks Chinese on a same-day collision", () => {
    const first = wikiIngest(repo, "修播放器笔记", "player notes", "sources");
    const second = wikiIngest(repo, "验收归档笔记", "review notes", "sources");
    assert.match(first.path, /修播放器笔记/);
    assert.match(second.path, /验收归档笔记/);
    assert.notEqual(first.path, second.path);
    assert.throws(() => wikiIngest(repo, "修播放器笔记", "again", "sources"), (err: unknown) => {
      assert.equal((err as Error).message, wikiRawRejectReason(first.path));
      assert.equal((err as Error).message.includes("already exists"), false);
      return true;
    });
  });

  it("still blocks frozen layers when layerIds names another layer", () => {
    const project = initProject(repo, "Harbor", "studio");
    const task = {
      ...project.tasks[0],
      layerIds: ["app"],
      allowFrozenTouch: false,
      allowedPaths: [],
    };
    const report = checkBlast(project, task, ["package.json"]);
    assert.equal(report.verdict, "blocked");
  });

  it("lists artifacts and lets a human plant an existing branch", () => {
    mkdirSync(join(repo, "out"), { recursive: true });
    writeFileSync(join(repo, "out", "index.html"), "<html></html>\n");
    runGit(repo, ["branch", "feature/hold"]);
    const holdings = projectHoldings(repo);
    assert.ok(holdings.artifacts.some((item) => item.name === "out"));
    const planted = plantBranch(repo, "feature/hold", { actor: "human" });
    assert.equal(planted.planted, true);
    assert.ok(existsSync(planted.path));
    const again = plantBranch(repo, "feature/hold", { actor: "human" });
    assert.equal(again.planted, false);
    assert.equal(again.path, planted.path);
  });

  it("sees staged edits in blast file lists", () => {
    const { task } = createTask(repo, { title: "stage-check", allowedPaths: ["app/**"] });
    const { worktree } = openWorktree(repo, task.id);
    writeFileSync(join(worktree.path, "package.json"), "{\"x\":1}\n");
    runGit(worktree.path, ["add", "package.json"]);
    const files = changedFiles(worktree.path, "main");
    assert.ok(files.includes("package.json"));
    assert.ok(existsSync(join(worktree.path, ".lattice", "charter.md")));
    assert.ok(existsSync(join(worktree.path, "WORKZOON.md")));
    assert.ok(existsSync(join(worktree.path, "AGENTS.md")));
  });

  it("parses compiled entity pages as type entity", () => {
    const pages = wikiList(repo);
    const repoPage = pages.find((page) => page.path.endsWith("entities/repo.md"));
    assert.equal(repoPage?.type, "entity");
    assert.equal(repoPage?.compiled, true);
    const holdings = pages.find((page) => page.path.endsWith("entities/holdings.md"));
    assert.equal(holdings?.type, "entity");
  });

  it("flags uncompiled raw, then clears after a sources page links back", () => {
    const ingested = wikiIngest(repo, "Compile chain", "A paper to compile.", "sources");
    const before = wikiLint(repo);
    const uncompiled = before.issues.find((item) => item.kind === "raw-uncompiled" && item.path === ingested.path);
    assert.ok(uncompiled);
    assert.match(uncompiled?.detail || "", /没有百科页指向这份原文/);
    mkdirSync(join(repo, ".lattice", "wiki", "sources"), { recursive: true });
    writeFileSync(
      join(repo, ".lattice", "wiki", "sources", "compile-chain.md"),
      `---
title: Compile chain
type: source
---

Raw: ${ingested.path}
`,
    );
    const after = wikiLint(repo);
    assert.ok(!after.issues.some((item) => item.kind === "raw-uncompiled" && item.path === ingested.path));
  });

  it("flags raw-escape when a hashed raw file is edited", () => {
    const ingested = wikiIngest(repo, "Escape hatch", "do not edit", "sources");
    const abs = join(repo, ingested.path);
    writeFileSync(abs, `${readFileSync(abs, "utf8")}\ntampered\n`);
    const lint = wikiLint(repo);
    const escaped = lint.issues.find((item) => item.kind === "raw-escape" && item.path === ingested.path);
    assert.ok(escaped);
    assert.match(escaped?.detail || "", /收进来之后被改过/);
  });

  it("blocks markDone when wiki.gate is block and handoff raw is uncompiled", () => {
    const { task } = createTask(repo, { title: "gate-block", allowedPaths: ["app/**"] }, { actor: "human" });
    updatePolicy(
      repo,
      {
        wiki: {
          ingestHandoffs: "always",
          agentWrites: { concepts: true, sources: true, syntheses: true },
          gate: "block",
        },
      },
      { actor: "human" },
    );
    generateHandoff(repo, task.id, { decisions: "Keep it.", nextAction: "Compile the wiki." });
    assert.throws(() => markDone(repo, task.id, { actor: "human" }), /百科还拦着|没写/);
  });

  it("resolves wikilinks by slug, path suffix, and title", () => {
    const pages = wikiList(repo);
    const repoPage = pages.find((page) => page.path.endsWith("entities/repo.md"));
    assert.ok(repoPage);
    assert.equal(resolveWikiLink(pages, "repo")?.path, repoPage.path);
    assert.equal(resolveWikiLink(pages, "entities/repo")?.path, repoPage.path);
    assert.equal(resolveWikiLink(pages, repoPage.title)?.path, repoPage.path);
    assert.equal(resolveWikiLink(pages, "no-such-page"), undefined);
  });

  it("does not auto-open index on an empty catalog or the first hit while searching", () => {
    const index = [{ path: ".lattice/wiki/index.md" }];
    const hits = [{ path: ".lattice/raw/note.md" }, { path: ".lattice/wiki/concepts/x.md" }];
    assert.equal(wikiAutoOpen(index, undefined, false), null);
    assert.equal(wikiAutoOpen(hits, undefined, true), null);
    assert.equal(wikiAutoOpen(hits, ".lattice/wiki/index.md", true), null);
    assert.equal(wikiAutoOpen(index, ".lattice/wiki/index.md", false), null);
  });

  it("speaks Chinese when a wiki page is outside, missing, or in an unknown bucket", () => {
    const project = loadProject(repo)!;
    const wikiDir = join(repo, ".lattice", "wiki");
    const before = readdirSync(wikiDir, { recursive: true }).join("\n");
    assert.equal(wikiPageRejectReason("outside"), "这页不在百科里。请打开百科里的页，或原文。");
    assert.throws(() => wikiPage(repo, "app/page.tsx"), (err: unknown) => {
      assert.equal((err as Error).message, wikiPageRejectReason("outside"));
      assert.equal((err as Error).message.includes("wiki/raw"), false);
      return true;
    });
    assert.throws(() => wikiPage(repo, ".lattice/wiki/concepts/no-such.md"), (err: unknown) => {
      assert.equal((err as Error).message, wikiPageRejectReason("missing"));
      assert.equal((err as Error).message.includes("Missing page"), false);
      return true;
    });
    assert.throws(
      () => writeWikiPage(project, { bucket: "inbox" as never, title: "Nope", body: "should not land" }, { actor: "human" }),
      (err: unknown) => {
        assert.equal((err as Error).message, wikiPageRejectReason("bucket"));
        assert.equal((err as Error).message.includes("Unknown wiki"), false);
        return true;
      },
    );
    assert.equal(readdirSync(wikiDir, { recursive: true }).join("\n"), before);
  });
});
