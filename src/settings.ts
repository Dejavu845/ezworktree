import { join } from "node:path";
import { homedir } from "node:os";
import type { AppSettings, AppSkin, ForgeDecor } from "./types.ts";

export type OpenRecipe = {
  openIn: AppSettings["openIn"];
  label: string;
  command: string;
};

const OPEN_LABEL: Record<AppSettings["openIn"], string> = {
  cursor: "复制打开命令，不会自动打开",
  vscode: "复制打开命令，不会自动打开",
  finder: "复制打开命令，不会自动打开",
  terminal: "复制打开命令，不会自动打开",
  none: "只复制路径",
};

function quotePath(path: string): string {
  if (!path) return path;
  if (/[\s'"$`\\]/.test(path)) return `"${path.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  return path;
}

export function openRecipe(openIn: AppSettings["openIn"] | undefined, path: string): OpenRecipe {
  const mode = openIn === "vscode" || openIn === "finder" || openIn === "terminal" || openIn === "none" ? openIn : "cursor";
  const quoted = quotePath(path.trim());
  const command =
    mode === "none" ? path.trim() : mode === "vscode" ? `code ${quoted}` : mode === "finder" ? `open ${quoted}` : mode === "terminal" ? `cd ${quoted}` : `cursor ${quoted}`;
  return { openIn: mode, label: OPEN_LABEL[mode], command };
}

export function normalizeSkin(value: unknown): AppSkin {
  return value === "forge" ? "forge" : "lean";
}

export function normalizeForgeDecor(value: unknown): ForgeDecor {
  return value === "on" ? "on" : "off";
}

function home(): string {
  return process.env.LATTICE_HOME || join(homedir(), ".lattice");
}

export function defaultWorktreesRoot(): string {
  if (process.env.LATTICE_HOME) return join(process.env.LATTICE_HOME, "worktrees");
  return join(homedir(), "Workzoon", "worktrees");
}

export function expandWorktreesRoot(value: string): string {
  const trimmed = (value || "").trim();
  if (!trimmed) return defaultWorktreesRoot();
  if (trimmed === "~") return homedir();
  if (trimmed.startsWith("~/")) return join(homedir(), trimmed.slice(2));
  return trimmed;
}

export function collapseWorktreesRoot(value: string): string {
  const expanded = expandWorktreesRoot(value);
  const home = homedir();
  if (expanded === home) return "~";
  const prefix = `${home}/`;
  if (expanded.startsWith(prefix)) return `~/${expanded.slice(prefix.length)}`;
  return expanded;
}

export function defaultAppSettings(): AppSettings {
  return {
    openIn: "cursor",
    worktreesRoot: collapseWorktreesRoot(defaultWorktreesRoot()),
    defaultPreset: "balanced",
    confirmDestructive: true,
    motion: "system",
    skin: "lean",
    forgeDecor: "off",
  };
}

export function mergeAppSettings(partial?: Partial<AppSettings> | null): AppSettings {
  const base = defaultAppSettings();
  const root = partial?.worktreesRoot?.trim() ? partial.worktreesRoot : base.worktreesRoot;
  return {
    openIn: partial?.openIn || base.openIn,
    worktreesRoot: collapseWorktreesRoot(root),
    defaultPreset: partial?.defaultPreset || base.defaultPreset,
    confirmDestructive: partial?.confirmDestructive ?? base.confirmDestructive,
    motion: partial?.motion || base.motion,
    skin: normalizeSkin(partial?.skin ?? base.skin),
    forgeDecor: normalizeForgeDecor(partial?.forgeDecor ?? base.forgeDecor),
  };
}
