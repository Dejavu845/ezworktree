export type InspectorTab = "holdings" | "task" | "charter" | "handoff" | "blast" | "wiki";
export type MainView = "holdings" | "forest" | "lanes";

export type Shortcut =
  | { kind: "wiki-search" }
  | { kind: "tab"; tab: InspectorTab }
  | { kind: "next-hand" }
  | { kind: "view"; view: MainView };

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!target || typeof target !== "object") return false;
  const el = target as { tagName?: string; isContentEditable?: boolean; closest?: (sel: string) => unknown };
  const tag = String(el.tagName || "").toUpperCase();
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (el.isContentEditable) return true;
  return typeof el.closest === "function" && Boolean(el.closest("input, textarea, select, [contenteditable='true']"));
}

export function shortcutFor(key: string, typing: boolean): Shortcut | null {
  if (key === "/" && !typing) return { kind: "wiki-search" };
  if (typing) return null;
  if (key === "2") return { kind: "tab", tab: "handoff" };
  if (key === "1") return { kind: "tab", tab: "task" };
  if (key === "3") return { kind: "tab", tab: "blast" };
  if (key === "4") return { kind: "tab", tab: "wiki" };
  if (key === "0") return { kind: "tab", tab: "holdings" };
  if (key === "n") return { kind: "next-hand" };
  if (key === "h") return { kind: "view", view: "holdings" };
  if (key === "f") return { kind: "view", view: "forest" };
  if (key === "l") return { kind: "view", view: "lanes" };
  return null;
}
