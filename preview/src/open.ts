import type { AppSettings } from "./api";

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

/** Copy-only recipe. Preview never spawns Cursor / VS Code / Finder / terminal. */
export function openRecipe(openIn: AppSettings["openIn"] | undefined, path: string): OpenRecipe {
  const mode = openIn === "vscode" || openIn === "finder" || openIn === "terminal" || openIn === "none" ? openIn : "cursor";
  const quoted = quotePath(path.trim());
  const command =
    mode === "none" ? path.trim() : mode === "vscode" ? `code ${quoted}` : mode === "finder" ? `open ${quoted}` : mode === "terminal" ? `cd ${quoted}` : `cursor ${quoted}`;
  return { openIn: mode, label: OPEN_LABEL[mode], command };
}
