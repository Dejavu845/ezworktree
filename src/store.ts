import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { normalizeCharterVersion } from "./charter.ts";
import { mergePolicy, policyFingerprint, renderPolicyMarkdown } from "./policy.ts";
import { expandWorktreesRoot, mergeAppSettings } from "./settings.ts";
import type { Catalog, Group, Project } from "./types.ts";

function normalizeTasks(project: Project): void {
  for (const task of project.tasks) {
    if (!task.intent) task.intent = "feat";
    if (!task.baseBranch) task.baseBranch = project.baseBranch;
  }
}

function normalizeCharter(project: Project): boolean {
  const version = normalizeCharterVersion(project.charter?.version);
  if (project.charter.version === version) return false;
  project.charter.version = version;
  return true;
}

export function latticeHome(): string {
  return process.env.LATTICE_HOME || join(homedir(), ".lattice");
}

export function catalogPath(): string {
  return join(latticeHome(), "catalog.json");
}

export function worktreeProjectFolder(project: { id: string; name: string }): string {
  const slug = (project.name || "")
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  return slug || project.id;
}

export function worktreeRoot(project: { id: string; name: string }, taskSlug: string): string {
  const root = expandWorktreesRoot(loadCatalog().settings.worktreesRoot);
  return join(root, worktreeProjectFolder(project), taskSlug);
}

export function defaultGroups(): Group[] {
  return [
    { id: "studio", name: "Studio", sort: 0 },
    { id: "career", name: "Career", sort: 1 },
    { id: "experiments", name: "Experiments", sort: 2 },
  ];
}

export function loadCatalog(): Catalog {
  const path = catalogPath();
  if (!existsSync(path)) {
    return {
      groups: defaultGroups(),
      projects: [],
      latticeHome: latticeHome(),
      settings: mergeAppSettings(),
    };
  }
  const parsed = JSON.parse(readFileSync(path, "utf8")) as Catalog;
  parsed.latticeHome = latticeHome();
  if (!parsed.groups?.length) parsed.groups = defaultGroups();
  parsed.settings = mergeAppSettings(parsed.settings);
  return parsed;
}

export function saveCatalog(catalog: Catalog): void {
  const path = catalogPath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(catalog, null, 2)}\n`);
}

export function projectFile(rootPath: string): string {
  return join(rootPath, ".lattice", "project.json");
}

export function projectToDisk(project: Project): Omit<Project, "rootPath"> {
  const { rootPath: _machine, ...disk } = project;
  return disk;
}

export function hydrateProject(raw: Omit<Project, "rootPath"> & { rootPath?: string }, rootPath: string): Project {
  const { rootPath: _stale, ...rest } = raw;
  return { ...rest, rootPath };
}

function writeProjectFile(path: string, project: Project): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(projectToDisk(project), null, 2)}\n`);
}

export function loadProject(rootPath: string): Project | null {
  const path = projectFile(rootPath);
  if (!existsSync(path)) return null;
  const raw = JSON.parse(readFileSync(path, "utf8")) as Project & { rootPath?: string };
  const project = hydrateProject(raw, rootPath);
  const merged = mergePolicy(project.policy);
  const before = policyFingerprint(project.policy);
  const after = policyFingerprint(merged);
  project.policy = merged;
  normalizeTasks(project);
  const staleCharter = normalizeCharter(project);
  const staleRoot = typeof raw.rootPath === "string";
  if (before !== after || staleRoot || staleCharter) {
    writeProjectFile(path, project);
    if (before !== after) {
      const markdown = renderPolicyMarkdown(merged);
      writeFileSync(join(rootPath, ".lattice", "POLICY.md"), markdown.endsWith("\n") ? markdown : `${markdown}\n`);
    }
  }
  return project;
}

export function rootPathRejectReason(): string {
  return "这张仓还没对上文件夹。从左边重新打开，或先点左下登记仓。";
}

export function saveProject(project: Project): void {
  if (!project.rootPath) throw new Error(rootPathRejectReason());
  project.policy = mergePolicy(project.policy);
  writeProjectFile(projectFile(project.rootPath), project);
}
