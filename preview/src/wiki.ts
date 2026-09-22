import type { WikiPage } from "./api";

export type WikiLinkPart =
  | { kind: "text"; text: string }
  | { kind: "link"; target: string; label: string };

const WIKI_LINK = /\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/g;

export function splitWikiLinks(body: string): WikiLinkPart[] {
  const parts: WikiLinkPart[] = [];
  let last = 0;
  for (const match of body.matchAll(WIKI_LINK)) {
    const index = match.index || 0;
    if (index > last) parts.push({ kind: "text", text: body.slice(last, index) });
    const target = match[1].trim();
    parts.push({ kind: "link", target, label: (match[2] || match[1]).trim() });
    last = index + match[0].length;
  }
  if (last < body.length) parts.push({ kind: "text", text: body.slice(last) });
  return parts;
}

export function wikiAutoOpen(
  visible: { path: string }[],
  currentPath: string | undefined,
  searching: boolean,
): string | null {
  if (searching) return null;
  if (!visible.length) return null;
  if (currentPath && visible.some((item) => item.path === currentPath)) return null;
  return null;
}

export function resolveWikiLink(pages: WikiPage[], link: string): WikiPage | undefined {
  const needle = link.trim().replace(/\\/g, "/").replace(/\.md$/, "").replace(/^\.lattice\//, "").toLowerCase();
  if (!needle) return undefined;
  const slug = needle.split("/").pop() || needle;
  return (
    pages.find((page) => {
      const path = page.path.replace(/\\/g, "/").replace(/\.md$/, "").replace(/^\.lattice\//, "").toLowerCase();
      return path === needle || path.endsWith(`/${needle}`) || path.endsWith(`/${slug}`);
    }) ||
    pages.find((page) => {
      const title = page.title.toLowerCase();
      return title === needle || title === slug;
    })
  );
}

export const HIT_LABEL: Record<string, string> = {
  title: "标题",
  type: "类型",
  tags: "标签",
  path: "路径",
  body: "正文",
};

export const ISSUE_LABEL: Record<string, string> = {
  "index-missing": "未进目录",
  "broken-link": "断链",
  "entity-hand-edit": "实体手改",
  "write-forbidden": "关闭目录",
  orphan: "无链入",
  "raw-escape": "原文被改过",
  "raw-uncompiled": "原文还没写进百科",
  "index-stale": "目录过期",
};
