import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { runGit } from "../src/git.ts";
import { occupancyForTask } from "../src/occupancy.ts";
import { doingRejectReason, parsePulse, pulseClearRejectReason, pulsePath, pulseShapeRejectReason, pulseWriteRejectReason, PULSE_DOING_MAX, PULSE_TTL_MS, readPulse } from "../src/pulse.ts";
import {
  archiveWorktree,
  createTask,
  generateHandoff,
  initProject,
  markDone,
  openWorktree,
  projectLedger,
  writeTaskPulse,
  clearTaskPulse,
} from "../src/service.ts";
import { loadProject } from "../src/store.ts";

const HOME = mkdtempSync(join(tmpdir(), "pulse-home-"));
process.env.LATTICE_HOME = HOME;
const HUMAN = { actor: "human" as const };
const repos: string[] = [];

after(() => {
  rmSync(HOME, { recursive: true, force: true });
  for (const repo of repos) rmSync(repo, { recursive: true, force: true });
});

function makeRepo(): string {
  const root = mkdtempSync(join(tmpdir(), "pulse-repo-"));
  runGit(root, ["init", "-b", "main"]);
  runGit(root, ["config", "user.email", "pulse@test.local"]);
  runGit(root, ["config", "user.name", "Pulse"]);
  mkdirSync(join(root, "app"), { recursive: true });
  writeFileSync(join(root, "app", "page.tsx"), "export default function Page() { return null }\n");
  writeFileSync(join(root, "README.md"), "# demo\n");
  runGit(root, ["add", "."]);
  runGit(root, ["commit", "-m", "init"]);
  return root;
}

function fixture(name = "Pulse"): { repo: string; taskId: string; tree: string } {
  const repo = makeRepo();
  repos.push(repo);
  initProject(repo, name, "studio");
  const { task } = createTask(repo, { title: "pulse row", allowedPaths: ["app/**"] }, HUMAN);
  const { worktree } = openWorktree(repo, task.id, HUMAN);
  writeFileSync(join(worktree.path, "app", "page.tsx"), "export default function Page() { return 1 }\n");
  return { repo, taskId: task.id, tree: worktree.path };
}

function projectOf(repo: string) {
  return loadProject(repo)!;
}

function taskOf(repo: string, id: string) {
  return projectOf(repo).tasks.find((item: { id: string }) => item.id === id);
}

describe("pulse registration", () => {
  it("overrides doing when the cite is a live blast path", () => {
    const { repo, taskId, tree } = fixture("PulseLive");
    const before = projectLedger(repo);
    const { pulse } = writeTaskPulse(
      repo,
      { taskId, doing: "rewire the player bar", remainMin: 20, cite: { kind: "path", value: "app/page.tsx" } },
      { actor: "agent", agent: "cursor" },
    );
    assert.equal(pulse.doing, "rewire the player bar");
    assert.equal(pulse.remainMin, 20);
    assert.ok(existsSync(pulsePath(projectOf(repo), taskId)));
    assert.ok(existsSync(join(tree, ".lattice", "pulses", `${taskId}.json`)));
    const row = occupancyForTask(projectOf(repo), taskOf(repo, taskId));
    assert.equal(row.doing, "rewire the player bar");
    assert.equal(row.doingFrom, "pulse");
    assert.equal(row.pulse?.remainMin, 20);
    assert.equal(projectLedger(repo), before);
  });

  it("rejects percent, extra keys, and a missing cite path", () => {
    const { repo, taskId } = fixture("PulseReject");
    assert.throws(
      () => parsePulse({ v: 1, taskId, agent: "cursor", doing: "37%", cite: { kind: "path", value: "app/page.tsx" } }),
      (err: unknown) => {
        assert.equal((err as Error).message, doingRejectReason("percent"));
        assert.equal((err as Error).message.includes("cannot contain"), false);
        return true;
      },
    );
    assert.throws(
      () => parsePulse({ v: 1, taskId, agent: "cursor", doing: "", cite: { kind: "path", value: "app/page.tsx" } }),
      (err: unknown) => {
        assert.equal((err as Error).message, doingRejectReason("empty"));
        return true;
      },
    );
    assert.throws(
      () =>
        parsePulse({
          v: 1,
          taskId,
          agent: "cursor",
          doing: "字".repeat(PULSE_DOING_MAX + 1),
          cite: { kind: "path", value: "app/page.tsx" },
        }),
      (err: unknown) => {
        assert.equal((err as Error).message, doingRejectReason("long"));
        return true;
      },
    );
    assert.throws(
      () =>
        parsePulse({
          v: 1,
          taskId,
          agent: "cursor",
          doing: "ok",
          remainMin: 0.5,
          cite: { kind: "path", value: "app/page.tsx" },
        }),
      (err: unknown) => {
        assert.equal((err as Error).message, doingRejectReason("remain"));
        return true;
      },
    );
    assert.throws(
      () =>
        parsePulse({
          v: 1,
          taskId,
          agent: "cursor",
          doing: "ok",
          cite: { kind: "path", value: "app/page.tsx" },
          extra: true,
        }),
      (err: unknown) => {
        assert.equal((err as Error).message, pulseShapeRejectReason("extra"));
        assert.equal((err as Error).message.includes("only allows"), false);
        return true;
      },
    );
    assert.throws(() => parsePulse(null), (err: unknown) => {
      assert.equal((err as Error).message, pulseShapeRejectReason("not-object"));
      return true;
    });
    assert.throws(
      () => parsePulse({ v: 1, taskId, agent: "cursor", doing: "ok", cite: "nope" }),
      (err: unknown) => {
        assert.equal((err as Error).message, pulseShapeRejectReason("cite-shape"));
        return true;
      },
    );
    assert.throws(
      () =>
        writeTaskPulse(
          repo,
          { taskId, doing: "ghost", cite: { kind: "path", value: "no/such.ts" } },
          { actor: "agent", agent: "cursor" },
        ),
      /不在这次改动里/,
    );
  });

  it("accepts a short sha or an absolute worktree path, and speaks Chinese when cite is empty", () => {
    const { repo, taskId, tree } = fixture("PulseCite");
    const sha = runGit(tree, ["rev-parse", "HEAD"]);
    const short = writeTaskPulse(
      repo,
      { taskId, doing: "short sha", cite: { kind: "sha", value: sha.slice(0, 12) } },
      HUMAN,
    );
    assert.equal(short.pulse.cite.value, sha.slice(0, 12));
    const abs = writeTaskPulse(
      repo,
      { taskId, doing: "abs path", cite: { kind: "path", value: join(tree, "app", "page.tsx") } },
      HUMAN,
    );
    assert.equal(abs.pulse.cite.value, "app/page.tsx");
    assert.throws(
      () => writeTaskPulse(repo, { taskId, doing: "empty", cite: { kind: "sha", value: "" } }, HUMAN),
      /还没标是哪一版/,
    );
  });

  it("treats an expired or broken cite as absent", () => {
    const { repo, taskId, tree } = fixture("PulseStale");
    writeTaskPulse(
      repo,
      { taskId, doing: "still wiring", cite: { kind: "path", value: "app/page.tsx" } },
      { actor: "agent", agent: "cursor" },
    );
    const stored = readPulse(projectOf(repo), taskId);
    assert.ok(stored);
    writeFileSync(
      pulsePath(projectOf(repo), taskId),
      `${JSON.stringify({ ...stored, writtenAt: new Date(Date.now() - PULSE_TTL_MS - 1000).toISOString() }, null, 2)}\n`,
    );
    const expired = occupancyForTask(projectOf(repo), taskOf(repo, taskId), { now: Date.now() });
    assert.equal(expired.doingFrom, "derived");
    assert.notEqual(expired.doing, "still wiring");

    writeTaskPulse(
      repo,
      { taskId, doing: "cite me", cite: { kind: "path", value: "app/page.tsx" } },
      { actor: "agent", agent: "cursor" },
    );
    writeFileSync(join(tree, "app", "page.tsx"), "export default function Page() { return null }\n");
    const broken = occupancyForTask(projectOf(repo), taskOf(repo, taskId));
    assert.equal(broken.doingFrom, "derived");
    assert.notEqual(broken.doing, "cite me");
  });

  it("lets a human pulse any task and blocks another agent", () => {
    const repo = makeRepo();
    repos.push(repo);
    initProject(repo, "PulseAgent", "studio");
    const { task } = createTask(repo, { title: "owned", agent: "codex", allowedPaths: ["app/**"] }, HUMAN);
    openWorktree(repo, task.id, HUMAN);
    assert.equal(pulseWriteRejectReason(), "这张卡不是你的。换分配给你的卡，或用人来登记。");
    assert.throws(
      () =>
        writeTaskPulse(
          repo,
          { taskId: task.id, doing: "nope", cite: { kind: "sha", value: "HEAD" } },
          { actor: "agent", agent: "cursor" },
        ),
      (err: unknown) => {
        assert.equal((err as Error).message, pulseWriteRejectReason());
        assert.equal((err as Error).message.includes("assigned to them"), false);
        return true;
      },
    );
    assert.equal(readPulse(projectOf(repo), task.id), null);
    const { pulse } = writeTaskPulse(
      repo,
      { taskId: task.id, doing: "human override", cite: { kind: "sha", value: "HEAD" } },
      HUMAN,
    );
    assert.equal(pulse.doing, "human override");
  });

  it("deletes the pulse on markDone and archive", () => {
    const { repo, taskId } = fixture("PulseGone");
    writeTaskPulse(
      repo,
      { taskId, doing: "finishing", cite: { kind: "path", value: "app/page.tsx" } },
      { actor: "agent", agent: "cursor" },
    );
    generateHandoff(repo, taskId, { decisions: "Keep the bar.", nextAction: "Ship it." });
    markDone(repo, taskId, HUMAN);
    assert.equal(existsSync(pulsePath(projectOf(repo), taskId)), false);

    const second = createTask(repo, { title: "archive me", allowedPaths: ["app/**"] }, HUMAN).task;
    const planted = openWorktree(repo, second.id, HUMAN);
    writeFileSync(join(planted.worktree.path, "app", "page.tsx"), "export default function Page() { return 2 }\n");
    writeTaskPulse(
      repo,
      { taskId: second.id, doing: "archiving", cite: { kind: "path", value: "app/page.tsx" } },
      { actor: "agent", agent: "cursor" },
    );
    archiveWorktree(repo, second.id, true, HUMAN, planted.worktree.branch);
    assert.equal(existsSync(pulsePath(projectOf(repo), second.id)), false);
  });

  it("does not copy pulse into a generated handoff", () => {
    const { repo, taskId } = fixture("PulseHandoff");
    writeTaskPulse(
      repo,
      { taskId, doing: "secret heartbeat", cite: { kind: "path", value: "app/page.tsx" } },
      { actor: "agent", agent: "cursor" },
    );
    const { markdown } = generateHandoff(repo, taskId);
    assert.doesNotMatch(markdown, /secret heartbeat/);
    assert.match(markdown, /## In flight/);
  });

  it("clears only for a human", () => {
    const { repo, taskId } = fixture("PulseClear");
    writeTaskPulse(
      repo,
      { taskId, doing: "clear me", cite: { kind: "path", value: "app/page.tsx" } },
      { actor: "agent", agent: "cursor" },
    );
    assert.equal(pulseClearRejectReason(), "只有人能清心跳。");
    assert.throws(() => clearTaskPulse(repo, taskId, { actor: "agent", agent: "cursor" }), (err: unknown) => {
      assert.equal((err as Error).message, pulseClearRejectReason());
      assert.equal((err as Error).message.includes("Only a human"), false);
      return true;
    });
    assert.ok(readPulse(projectOf(repo), taskId));
    clearTaskPulse(repo, taskId, HUMAN);
    assert.equal(readPulse(projectOf(repo), taskId), null);
  });
});
