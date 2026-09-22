import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { runGit } from "../src/git.ts";
import { handoffRejectReason, isAlignedHandoff, isValidHandoff, parseHandoffMeta, readHandoff, writeHandoff } from "../src/handoff.ts";
import {
  createTask,
  doneRejectReason,
  generateHandoff,
  handoffView,
  initProject,
  markDone,
  openWorktree,
} from "../src/service.ts";
import { loadProject } from "../src/store.ts";

const HOME = mkdtempSync(join(tmpdir(), "handoff-home-"));
process.env.LATTICE_HOME = HOME;
const HUMAN = { actor: "human" as const };
const repos: string[] = [];

after(() => {
  rmSync(HOME, { recursive: true, force: true });
  for (const repo of repos) rmSync(repo, { recursive: true, force: true });
});

function makeRepo(): string {
  const root = mkdtempSync(join(tmpdir(), "handoff-repo-"));
  runGit(root, ["init", "-b", "main"]);
  runGit(root, ["config", "user.email", "handoff@test.local"]);
  runGit(root, ["config", "user.name", "Handoff"]);
  mkdirSync(join(root, "app"), { recursive: true });
  writeFileSync(join(root, "app", "page.tsx"), "export default function Page() { return null }\n");
  writeFileSync(join(root, "README.md"), "# demo\n");
  runGit(root, ["add", "."]);
  runGit(root, ["commit", "-m", "init"]);
  return root;
}

function fixture(name = "Handoff"): string {
  const repo = makeRepo();
  repos.push(repo);
  initProject(repo, name, "studio");
  return repo;
}

describe("handoff frontmatter and HEAD", () => {
  it("speaks Chinese when markDone is refused", () => {
    assert.match(doneRejectReason("handoff"), /写完交接/);
    assert.match(doneRejectReason("handoff-empty"), /交接还是空的/);
    assert.match(doneRejectReason("head"), /重新生成交接/);
    assert.match(doneRejectReason("blast"), /能碰的范围/);
    assert.match(doneRejectReason("wiki-raw", { title: "修提示文案", count: 2 }), /百科还拦着.*修提示文案.*2 条没写/);
    assert.match(doneRejectReason("wiki-forbidden", { count: 1 }), /1 类现在不让写/);
    assert.equal(doneRejectReason("handoff").includes("Cannot"), false);
  });

  it("rejects a marker-only file and stamps none when no tree exists", () => {
    const repo = fixture("CardOnly");
    const { task } = createTask(repo, { title: "card handoff", allowedPaths: ["app/**"] }, HUMAN);
    assert.equal(isValidHandoff(`# HANDOFF\n<!-- agent-handoff v1 · task: ${task.id} -->\n\n## Decisions\n`), false);
    const { markdown } = generateHandoff(repo, task.id, {
      decisions: "Keep the card.",
      nextAction: "Plant later.",
    });
    const meta = parseHandoffMeta(markdown);
    assert.ok(meta);
    assert.equal(meta?.task, task.id);
    assert.equal(meta?.head, "none");
    assert.match(meta?.branch || "", /^feat\//);
    assert.equal(isValidHandoff(markdown), true);
    const project = loadProject(repo)!;
    assert.equal(isAlignedHandoff(project, project.tasks[0], markdown), true);
    const view = handoffView(repo, task.id);
    assert.equal(view.valid, true);
    assert.equal(view.markdown, markdown);
    assert.match(view.path, /handoffs/);
  });

  it("speaks Chinese when writeHandoff gets invalid markdown", () => {
    const repo = fixture("InvalidWrite");
    const { task } = createTask(repo, { title: "broken write", allowedPaths: ["app/**"] }, HUMAN);
    const project = loadProject(repo)!;
    assert.match(handoffRejectReason(), /还不完整/);
    assert.equal(handoffRejectReason().includes("frontmatter"), false);
    assert.throws(() => writeHandoff(project, "# HANDOFF\n", task, "agent", "next"), (err: unknown) => {
      assert.equal((err as Error).message, handoffRejectReason());
      return true;
    });
    assert.equal(readHandoff(project, task.id), null);
  });

  it("rejects extra frontmatter keys", () => {
    const repo = fixture("ExtraKey");
    const { task } = createTask(repo, { title: "extra key", allowedPaths: ["app/**"] }, HUMAN);
    const { markdown } = generateHandoff(repo, task.id, { decisions: "Keep.", nextAction: "Go." });
    const broken = markdown.replace("v: 1\n", "v: 1\npercent: 80\n");
    assert.equal(parseHandoffMeta(broken), null);
    assert.equal(isValidHandoff(broken), false);
  });

  it("refuses markDone after HEAD moves and accepts a regenerated handoff", () => {
    const repo = fixture("HeadMove");
    const { task } = createTask(repo, { title: "head move", allowedPaths: ["app/**"] }, HUMAN);
    const { worktree } = openWorktree(repo, task.id, HUMAN);
    generateHandoff(repo, task.id, { decisions: "First snapshot.", nextAction: "Commit more." });
    writeFileSync(join(worktree.path, "app", "page.tsx"), "export default function Page() { return 1 }\n");
    runGit(worktree.path, ["add", "app/page.tsx"]);
    runGit(worktree.path, ["commit", "-m", "move head"]);
    assert.throws(() => markDone(repo, task.id, HUMAN), (err: unknown) => {
      assert.equal((err as Error).message, doneRejectReason("head"));
      return true;
    });
    generateHandoff(repo, task.id, { decisions: "Moved with HEAD.", nextAction: "Mark done." });
    const done = markDone(repo, task.id, HUMAN);
    assert.equal(done.tasks.find((item) => item.id === task.id)?.status, "done");
  });

  it("refuses markDone while the handoff is still a placeholder", () => {
    const repo = fixture("EmptyFill");
    const { task } = createTask(repo, { title: "empty fill", allowedPaths: ["app/**"] }, HUMAN);
    generateHandoff(repo, task.id);
    assert.throws(() => markDone(repo, task.id, HUMAN), /交接还是空的/);
    const prompt = handoffView(repo, task.id).prompt;
    assert.match(prompt, /接下「EmptyFill」里的任务「empty fill」/);
    assert.equal(prompt.includes("You are taking over"), false);
  });
});
