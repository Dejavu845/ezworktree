import { normalizeCharterVersion } from "./charter.ts";
import { matchesAny } from "./glob.ts";
import type { BlastFinding, BlastReport, BlastVerdict, Project, Task } from "./types.ts";

export const WARNING_PATHS = [
  "pnpm-lock.yaml",
  "package-lock.json",
  "yarn.lock",
  "bun.lock",
  "bun.lockb",
  "**/*.map",
  "out/**",
  ".next/**",
];

const I18N_TRIPLET = /^messages\/(zh|en|ja)\.json$/;

export function classifyPath(filePath: string, project: Project, task: Task): BlastFinding {
  const path = filePath.replace(/\\/g, "/");
  const forbidden = [...project.charter.doNotTouch, ...task.forbiddenPaths];
  if (matchesAny(path, forbidden)) {
    return { path, verdict: "blocked", reason: "forbidden / do-not-touch" };
  }

  const frozenLayers = project.charter.layers.filter((layer) => layer.frozen);
  const hitsFrozen = frozenLayers.some((layer) => matchesAny(path, layer.paths));
  const frozenNames = frozenLayers
    .filter((layer) => matchesAny(path, layer.paths))
    .map((layer) => layer.name)
    .join(", ");
  if (hitsFrozen && !task.allowFrozenTouch) {
    return {
      path,
      verdict: "blocked",
      reason: `frozen layer (${frozenNames})`,
    };
  }

  if (matchesAny(path, WARNING_PATHS)) {
    return { path, verdict: "warning", reason: "generated / lockfile" };
  }

  if (/^\.lattice\/(tasks|handoffs)\//.test(path)) {
    return { path, verdict: "ok", reason: "engine-owned task file" };
  }

  if (task.allowedPaths.length > 0 && !matchesAny(path, task.allowedPaths)) {
    return { path, verdict: "blocked", reason: "outside allowed paths" };
  }

  if (hitsFrozen) {
    const extra = task.escalation
      ? `escalated: ${task.escalation.reason}`
      : "allowFrozenTouch (no reason on record)";
    return { path, verdict: "ok", reason: `frozen layer (${frozenNames}) · ${extra}` };
  }

  return { path, verdict: "ok", reason: "in scope" };
}

function rollup(findings: BlastFinding[]): BlastVerdict {
  if (findings.some((item) => item.verdict === "blocked")) return "blocked";
  if (findings.some((item) => item.verdict === "warning")) return "warning";
  return "ok";
}

export function checkBlast(project: Project, task: Task, files: string[]): BlastReport {
  const findings = files.map((file) => classifyPath(file, project, task));

  const i18nTouched = files.filter((file) => I18N_TRIPLET.test(file.replace(/\\/g, "/")));
  if (i18nTouched.length > 0 && i18nTouched.length < 3) {
    findings.push({
      path: "messages/{zh,en,ja}.json",
      verdict: "warning",
      reason: "i18n triplet only partially updated",
    });
  }

  return {
    verdict: rollup(findings),
    findings,
    files,
    charterVersion: normalizeCharterVersion(project.charter?.version),
  };
}
