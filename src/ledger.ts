import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { nowIso } from "./ids.ts";
import type { Actor, Project } from "./types.ts";

export function ledgerPath(project: Project): string {
  return join(project.rootPath, ".lattice", "ledger.md");
}

export function appendLedger(
  project: Project,
  entry: {
    actor: Actor;
    agent?: string;
    action: string;
    target: string;
    outcome: string;
    requestId?: string;
  },
): void {
  const path = ledgerPath(project);
  mkdirSync(dirname(path), { recursive: true });
  const who = entry.agent ? `${entry.actor}:${entry.agent}` : entry.actor;
  const extra = entry.requestId ? ` | ${entry.requestId}` : "";
  const line = `## [${nowIso()}] ${who} | ${entry.action} | ${entry.target} | ${entry.outcome}${extra}`;
  if (!existsSync(path)) {
    writeFileSync(path, `# Ledger\n\n${line}\n`);
    return;
  }
  appendFileSync(path, `\n${line}\n`);
}

export function readLedger(project: Project): string {
  const path = ledgerPath(project);
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

export function ledgerTail(project: Project, n = 10): string[] {
  return readLedger(project)
    .split("\n")
    .filter((line) => line.startsWith("## ["))
    .slice(-n);
}
