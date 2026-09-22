import { useEffect, useMemo, useRef, useState } from "react";
import type { WikiLint, WikiPage } from "./api";
import { HIT_LABEL, ISSUE_LABEL, resolveWikiLink, splitWikiLinks, wikiAutoOpen } from "./wiki";

type LayerFilter = "all" | "wiki" | "raw";

export function WikiPane({
  pages,
  catalog,
  page,
  lint,
  query,
  ingestTitle,
  ingestBody,
  busy,
  searchFocus,
  onQuery,
  onTitle,
  onBody,
  onOpen,
  onFollow,
  onLint,
  onIngest,
  onWrite,
  onCopy,
}: {
  pages: WikiPage[];
  catalog: WikiPage[];
  page: WikiPage | null;
  lint: WikiLint | null;
  query: string;
  ingestTitle: string;
  ingestBody: string;
  busy: boolean;
  searchFocus: number;
  onQuery: (value: string) => void;
  onTitle: (value: string) => void;
  onBody: (value: string) => void;
  onOpen: (path: string) => void;
  onFollow: (target: string) => void;
  onLint: () => void;
  onIngest: () => void;
  onWrite: (bucket: "concepts" | "sources" | "syntheses") => void;
  onCopy: (label: string, value: string) => void;
}) {
  const searchRef = useRef<HTMLInputElement>(null);
  const [layer, setLayer] = useState<LayerFilter>("all");
  const visible = useMemo(
    () => pages.filter((item) => layer === "all" || item.layer === layer),
    [pages, layer],
  );
  const wikiCount = pages.filter((item) => item.layer === "wiki").length;
  const rawCount = pages.filter((item) => item.layer === "raw").length;
  const searching = Boolean(query.trim());
  const pathsKey = visible.map((item) => item.path).join("\0");

  useEffect(() => {
    if (!searchFocus) return;
    searchRef.current?.focus();
    searchRef.current?.select();
  }, [searchFocus]);

  useEffect(() => {
    const next = wikiAutoOpen(visible, page?.path, searching);
    if (next) onOpen(next);
  }, [pathsKey, searching]);

  useEffect(() => {
    if (page && pages.some((item) => item.path === page.path) && !visible.some((item) => item.path === page.path)) {
      setLayer("all");
    }
  }, [page?.path, pages, visible]);

  useEffect(() => {
    const selected = document.querySelector(".wiki-hits li.on");
    selected?.scrollIntoView({ block: "nearest" });
  }, [page?.path]);

  function move(delta: number) {
    if (!visible.length) return;
    const index = visible.findIndex((item) => item.path === page?.path);
    const next = visible[Math.min(visible.length - 1, Math.max(0, (index < 0 ? 0 : index) + delta))];
    if (next) onOpen(next.path);
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLTextAreaElement) return;
      if (target instanceof HTMLInputElement && target !== searchRef.current) return;
      if (target === searchRef.current) return;
      if (event.key === "j" || event.key === "ArrowDown") {
        event.preventDefault();
        move(1);
      }
      if (event.key === "k" || event.key === "ArrowUp") {
        event.preventDefault();
        move(-1);
      }
      if (event.key === "Enter" && visible[0]) {
        event.preventDefault();
        const current = visible.find((item) => item.path === page?.path) || visible[0];
        onOpen(current.path);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="pane wiki-pane">
      <h2>百科</h2>
      <p className="hint">这里只收原文。谁能写进百科，由你定。按斜杠搜索，j/k 换页。</p>
      <div className="wiki-search">
        <input
          ref={searchRef}
          value={query}
          onChange={(event) => onQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              move(1);
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              move(-1);
            } else if (event.key === "Enter") {
              event.preventDefault();
              const current = visible.find((item) => item.path === page?.path) || visible[0];
              if (current) onOpen(current.path);
            } else if (event.key === "Escape") {
              event.preventDefault();
              if (query) onQuery("");
              else searchRef.current?.blur();
            }
          }}
          placeholder="搜索标题或正文"
          aria-label="搜索百科"
        />
        {query ? (
          <button type="button" className="link" onClick={() => onQuery("")}>
            清空
          </button>
        ) : null}
      </div>
      <div className="seg" role="radiogroup" aria-label="层">
        {(
          [
            ["all", "全部"],
            ["wiki", "百科页"],
            ["raw", "原文"],
          ] as const
        ).map(([id, label]) => (
          <button key={id} type="button" className={layer === id ? "on" : ""} onClick={() => setLayer(id)}>
            {label}
          </button>
        ))}
      </div>
      <p className="hint">
        {searching
          ? visible.length
            ? `命中 ${visible.length} · ${wikiCount} 篇百科 · ${rawCount} 篇原文`
            : `没有命中 “${query.trim()}”`
          : `${wikiCount} 篇百科 · ${rawCount} 篇原文`}
      </p>
      {visible.length ? (
        <ul className="notes wiki-hits">
          {visible.map((item) => (
            <li key={item.path} className={page?.path === item.path ? "on" : ""}>
              <button type="button" className="wiki-hit" onClick={() => onOpen(item.path)}>
                <strong>{item.title}</strong>
                {item.hit ? (
                  <em>
                    <span className="tag">{HIT_LABEL[item.hit.field] || item.hit.field}</span>
                    {item.hit.snippet}
                  </em>
                ) : item.summary ? (
                  <em>{item.summary}</em>
                ) : null}
                <small>
                  {layerLabel(item.layer)} · {item.type}
                  {item.compiled ? " · 引擎" : ""} · {shortPath(item.path)}
                </small>
              </button>
              {page?.path === item.path ? (
                <article className="wiki-page">
                  <header>
                    <p className="hint">
                      {layerLabel(page.layer)} · {page.type}
                      {page.compiled ? " · 引擎" : ""}
                    </p>
                    <button type="button" className="link" onClick={() => onCopy("路径", page.path)}>
                      复制路径
                    </button>
                  </header>
                  <WikiBody
                    body={page.body}
                    pages={catalog.length ? catalog : pages}
                    onFollow={onFollow}
                  />
                </article>
              ) : null}
            </li>
          ))}
        </ul>
      ) : searching ? (
        <p className="empty">没有找到。换个词，或清空再看目录。</p>
      ) : null}
      <h3>收入原文</h3>
      <input value={ingestTitle} onChange={(event) => onTitle(event.target.value)} placeholder="来源标题" />
      <textarea value={ingestBody} onChange={(event) => onBody(event.target.value)} placeholder="贴原文。收进来之后不要再改。" />
      <div className="row">
        <button className="primary" disabled={busy} onClick={onIngest}>
          收入原文
        </button>
        <button disabled={busy} onClick={onLint}>
          检查
        </button>
        <button disabled={busy} onClick={() => onWrite("sources")}>
          编译来源
        </button>
        <button disabled={busy} onClick={() => onWrite("concepts")}>
          编译概念
        </button>
      </div>
      {lint ? (
        <>
          <p className={lint.ok ? "ok" : "warning"}>
            {lint.pages} 页 · {lint.issues.length} 个问题
            {lint.issues.some((item) => item.kind === "write-forbidden") ? " · 有关闭目录里的页" : ""}
          </p>
          {lint.issues.length ? (
            <ul className="notes wiki-hits">
              {lint.issues.map((item) => (
                <li key={`${item.kind}-${item.path}`}>
                  <button type="button" className="wiki-hit" onClick={() => onOpen(item.path)}>
                    <strong>{ISSUE_LABEL[item.kind] || item.kind}</strong>
                    <em>{item.detail}</em>
                    <small title={item.path}>{shortPath(item.path)}</small>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function layerLabel(layer: WikiPage["layer"]) {
  return layer === "wiki" ? "百科页" : "原文";
}

function shortPath(path: string) {
  return path.split("/").filter(Boolean).slice(-2).join("/") || path;
}

function WikiBody({
  body,
  pages,
  onFollow,
}: {
  body: string;
  pages: WikiPage[];
  onFollow: (target: string) => void;
}) {
  const parts = splitWikiLinks(body);
  return (
    <pre className="wiki-body">
      {parts.map((part, index) =>
        part.kind === "link" ? (
          <button
            key={`${part.target}-${index}`}
            type="button"
            className={resolveWikiLink(pages, part.target) ? "wikilink" : "wikilink miss"}
            onClick={() => onFollow(part.target)}
            title={resolveWikiLink(pages, part.target)?.path || `搜索 ${part.target}`}
          >
            {part.label}
          </button>
        ) : (
          <span key={index}>{part.text}</span>
        ),
      )}
    </pre>
  );
}
