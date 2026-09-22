import { Fragment, memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  setMotionPreference,
  useChromeMotion,
  useFocusReceive,
  useForgeParallax,
  useGlassSpecular,
  usePane,
  usePop,
  useRise,
  useScene,
} from "./motion";
import {
  api,
  type AgentAction,
  type AppSettings,
  type AppSkin,
  type BlastReport,
  type Consent,
  type ConsentRequest,
  type Drift,
  type Holdings,
  type Policy,
  type PolicyPreset,
  type Project,
  type RepoLane,
  type Snapshot,
  type SourceEntry,
  type Task,
  type HygieneKind,
  type Occupancy,
  type ProcessGraph,
  type ProcessStep,
  type WikiLint,
  type WikiPage,
} from "./api";
import { onDutySatellites, PROCESS_STEPS, processStripView, stripLabel } from "./graph";
import { bayPath, formatIdle, groupLanes, laneOf, liveBayCount, resolveSelection, shorten } from "./lanes";
import { WorktreeDeck } from "./WorktreeDeck";
import { openRecipe } from "./open";
import { resolveWikiLink } from "./wiki";
import { WikiPane } from "./WikiPane";
import { LoopRail } from "./LoopRail";
import { isTypingTarget, shortcutFor } from "./keys";
import { loopForLane, loopFromOccupancy, nextHandIntent, type LoopStep } from "./loop";

const POLICY_ACTIONS: { id: AgentAction; label: string; destructive: boolean; group: "任务" | "分支" | "宪章" | "百科" }[] = [
  { id: "createTask", label: "开新任务", destructive: false, group: "任务" },
  { id: "markDone", label: "标记任务完成", destructive: false, group: "任务" },
  { id: "escalateFrozen", label: "给自己的任务开「动冻层」", destructive: true, group: "任务" },
  { id: "createBranch", label: "为任务建分支和 worktree", destructive: false, group: "分支" },
  { id: "plantBranch", label: "检出已有分支为 worktree", destructive: false, group: "分支" },
  { id: "archiveWorktree", label: "归档干净的 worktree（留分支）", destructive: false, group: "分支" },
  { id: "archiveWorktreeForce", label: "丢弃未提交改动并归档", destructive: true, group: "分支" },
  { id: "deleteBranch", label: "删除分支", destructive: true, group: "分支" },
  { id: "editCharter", label: "修改宪章", destructive: true, group: "宪章" },
  { id: "ingestRaw", label: "收入原文", destructive: false, group: "百科" },
  { id: "lintFix", label: "检查时补目录", destructive: false, group: "百科" },
];
const POLICY_GROUPS: Array<(typeof POLICY_ACTIONS)[number]["group"]> = ["任务", "分支", "宪章", "百科"];
const TASK_STATUSES: Task["status"][] = ["backlog", "active", "review", "done", "blocked"];

const CONSENT_LABEL: Record<Consent, string> = { never: "禁止", ask: "需确认", allow: "允许" };
type Tab = "task" | "holdings" | "charter" | "handoff" | "wiki" | "blast";
type Filter = "all" | "active" | "review" | "done" | "hygiene" | "undeclared";
type View = "holdings" | "forest" | "lanes";

const STATUS: Record<Task["status"], string> = {
  backlog: "待开始",
  active: "进行中",
  review: "待审",
  done: "已完成",
  blocked: "受阻",
};

const VIEW_LABEL: Record<View, string> = {
  holdings: "掌控",
  forest: "全部分支",
  lanes: "任务车道",
};
const TAB_LABEL: Record<Tab, string> = {
  holdings: "资产清单",
  task: "对照",
  charter: "宪章",
  handoff: "交接",
  blast: "范围",
  wiki: "百科",
};
const TAB_HINT: Partial<Record<Tab, string>> = {
  holdings: "0",
  task: "1",
  handoff: "2",
  blast: "3",
  wiki: "/ 或 4",
};
const FILTER_LABEL: Record<Filter, string> = {
  all: "全部",
  active: "在场",
  review: "待审",
  done: "已完成",
  hygiene: "待清理",
  undeclared: "清单外",
};
const FILTER_TITLE: Record<Filter, string> = {
  all: "这一页的全部行",
  active: "车道：进行中和待开始。森林：已检出，或进行中/待开始的任务。",
  review: "状态为待审的任务；森林只显示挂了待审任务的分支",
  done: "状态为已完成的任务；森林只显示挂了已完成任务的分支",
  hygiene: "已合入、十四天没动静、或缺交接",
  undeclared: "仓库里有、清单里没有。你来处理，不会自动删。",
};

export function App() {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [groupId, setGroupId] = useState("studio");
  const [projectId, setProjectId] = useState<string | null>(null);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [laneId, setLaneId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("task");
  const [view, setView] = useState<View>("holdings");
  const [filter, setFilter] = useState<Filter>("all");
  const [rootDraft, setRootDraft] = useState("");
  const [nameDraft, setNameDraft] = useState("");
  const [titleDraft, setTitleDraft] = useState("");
  const [intentDraft, setIntentDraft] = useState<"feat" | "spike" | "hotfix">("feat");
  const [baseDraft, setBaseDraft] = useState("");
  const [allowDraft, setAllowDraft] = useState("app/**");
  const [frozenDraft, setFrozenDraft] = useState(false);
  const [reasonDraft, setReasonDraft] = useState("");
  const [decisionDraft, setDecisionDraft] = useState("");
  const [nextDraft, setNextDraft] = useState("");
  const [handoffText, setHandoffText] = useState("");
  const [promptText, setPromptText] = useState("");
  const [blast, setBlast] = useState<BlastReport | null>(null);
  const [pages, setPages] = useState<WikiPage[]>([]);
  const [wikiCatalog, setWikiCatalog] = useState<WikiPage[]>([]);
  const [wikiPage, setWikiPage] = useState<WikiPage | null>(null);
  const [wikiFocus, setWikiFocus] = useState(0);
  const [lint, setLint] = useState<WikiLint | null>(null);
  const [query, setQuery] = useState("");
  const [ingestTitle, setIngestTitle] = useState("");
  const [ingestBody, setIngestBody] = useState("");
  const [files, setFiles] = useState<SourceEntry[]>([]);
  const [browsePath, setBrowsePath] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [deleteFor, setDeleteFor] = useState<string | null>(null);
  const [appSettings, setAppSettings] = useState<AppSettings | null>(null);
  const [confirmBranch, setConfirmBranch] = useState("");
  const [graph, setGraph] = useState<ProcessGraph | null>(null);
  const [stripFocus, setStripFocus] = useState<ProcessStep>("repo");
  const [focusNonce, setFocusNonce] = useState(0);
  const [pulseFocus, setPulseFocus] = useState(0);
  const copyTimer = useRef(0);
  const goNextHandRef = useRef<() => void>(() => {});
  const shellRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLElement>(null);
  const inspectorRef = useRef<HTMLElement>(null);
  const paneRef = usePane<HTMLDivElement>(tab);
  const sceneRef = useScene<HTMLDivElement>(view);
  const toastRef = usePop<HTMLDivElement>(Boolean(copied || error || notice));
  const bumpFocus = useCallback(() => setFocusNonce((n) => n + 1), []);

  const project = useMemo(
    () => snap?.projects.find((item) => item.id === projectId) || snap?.projects[0] || null,
    [snap, projectId],
  );
  const map = useMemo(
    () => snap?.maps.find((item) => item.rootPath === project?.rootPath) || null,
    [snap, project],
  );
  const holdings = useMemo(
    () => snap?.holdings?.find((item) => item.rootPath === project?.rootPath) || null,
    [snap, project],
  );
  const visibleTasks = useMemo(() => {
    const list = project?.tasks || [];
    if (filter === "all") return list;
    if (filter === "hygiene") {
      const dirty = new Set(
        (map?.lanes || []).filter((lane) => lane.hygiene?.length).map((lane) => lane.taskId).filter(Boolean),
      );
      return list.filter((item) => dirty.has(item.id));
    }
    if (filter === "undeclared") return [];
    if (filter === "active") return list.filter((item) => item.status === "active" || item.status === "backlog");
    return list.filter((item) => item.status === filter);
  }, [project, filter, map]);
  const forestLanes = useMemo(() => {
    const list = map?.lanes || [];
    if (filter === "all") return list;
    if (filter === "hygiene") return list.filter((item) => (item.hygiene?.length || 0) > 0);
    if (filter === "undeclared") return list.filter((item) => item.undeclared);
    if (filter === "active") {
      return list.filter((item) => item.worktreePath || item.taskStatus === "active" || item.taskStatus === "backlog");
    }
    return list.filter((item) => item.taskStatus === filter);
  }, [map, filter]);
  const { lane: selectedLane, task } = useMemo(
    () =>
      resolveSelection({
        view,
        lanes: forestLanes,
        tasks: project?.tasks || [],
        laneId,
        taskId,
      }),
    [view, forestLanes, project?.tasks, laneId, taskId],
  );
  const groupedForest = useMemo(
    () => groupLanes(forestLanes, project?.baseBranch || "main"),
    [forestLanes, project?.baseBranch],
  );
  const pendingCount = useMemo(
    () => (snap?.requests || []).filter((item) => item.rootPath === project?.rootPath).length,
    [snap, project],
  );
  const drift = useMemo(
    () => (snap?.drift || []).find((d) => d.rootPath === project?.rootPath)?.items || [],
    [snap, project],
  );
  const occupancyRows = useMemo(
    () => (snap?.occupancy || []).find((item) => item.rootPath === project?.rootPath)?.rows || [],
    [snap, project],
  );
  const strip = useMemo(
    () =>
      graph
        ? processStripView(graph, {
            branch: selectedLane?.branch,
            worktreePath: selectedLane?.worktreePath || undefined,
          })
        : null,
    [graph, selectedLane],
  );
  const dutyRows = useMemo(() => onDutySatellites(occupancyRows), [occupancyRows]);
  const selectedOccupancy = useMemo(
    () => (task ? occupancyRows.find((row) => row.taskId === task.id) : undefined),
    [occupancyRows, task],
  );
  const loop = useMemo(() => {
    if (!task) return null;
    const planted = Boolean(
      selectedOccupancy?.evidence.find((cell) => cell.id === "tree")?.lit ||
        (selectedLane?.worktreePath && selectedLane.worktreePath !== project?.rootPath),
    );
    return loopFromOccupancy(task.status, selectedOccupancy, planted);
  }, [task, selectedOccupancy, selectedLane, project?.rootPath]);
  const uncheckedCount = useMemo(
    () => (map?.lanes || []).filter((item) => !item.worktreePath).length,
    [map],
  );
  const taskStats = useMemo(() => {
    const counts: Record<Task["status"], number> = { backlog: 0, active: 0, review: 0, done: 0, blocked: 0 };
    for (const item of project?.tasks || []) counts[item.status] += 1;
    return counts;
  }, [project]);

  const grouped = useMemo(() => {
    const groups = snap?.catalog.groups || [];
    return groups
      .slice()
      .sort((a, b) => a.sort - b.sort)
      .map((group) => ({
        ...group,
        projects: (snap?.projects || []).filter((item) => (item.groupId || "studio") === group.id),
      }));
  }, [snap]);

  const listRef = useRise<HTMLUListElement>([view, filter, project?.id, forestLanes.length, visibleTasks.length]);
  const boardRef = useRise<HTMLDivElement>([view, project?.id, holdings?.artifacts.length]);
  useChromeMotion(shellRef, [snap?.projects.length, view, tab, forestLanes.length]);
  useForgeParallax(shellRef, contentRef, false);
  useGlassSpecular(shellRef, appSettings?.motion !== "off");
  useFocusReceive(inspectorRef, focusNonce);

  useEffect(() => {
    setMotionPreference(appSettings?.motion || "system");
  }, [appSettings?.motion]);

  const refresh = useCallback(async (preferredProject?: string, preferredTask?: string) => {
    const next = await api.snapshot();
    setSnap(next);
    if (next.catalog.settings) setAppSettings(next.catalog.settings);
    else {
      try {
        setAppSettings(await api.settings());
      } catch {
        setAppSettings(null);
      }
    }
    const chosen = next.projects.find((item) => item.id === (preferredProject || projectId)) || next.projects[0];
    if (chosen) {
      setProjectId(chosen.id);
      const nextTask = chosen.tasks.find((item) => item.id === (preferredTask || taskId)) || chosen.tasks[0];
      setTaskId(nextTask?.id || null);
      const nextMap = next.maps.find((item) => item.rootPath === chosen.rootPath);
      const nextLane =
        nextMap?.lanes.find((item) => item.taskId === nextTask?.id) ||
        nextMap?.lanes.find((item) => item.id === laneId) ||
        nextMap?.lanes[0];
      setLaneId(nextLane?.id || null);
    }
  }, [projectId, taskId, laneId]);

  useEffect(() => {
    if (!project?.rootPath) {
      setGraph(null);
      return;
    }
    let cancelled = false;
    api
      .graph(project.rootPath)
      .then((next) => {
        if (!cancelled) setGraph(next);
      })
      .catch(() => {
        if (!cancelled) setGraph(null);
      });
    return () => {
      cancelled = true;
    };
  }, [project?.rootPath, snap]);

  useEffect(() => {
    refresh().catch((err) => setError(String(err.message || err)));
  }, []);

  useEffect(() => {
    if (!project || tab !== "wiki") return;
    const handle = window.setTimeout(() => {
      api.wiki(project.rootPath, query).then(setPages).catch(() => setPages([]));
    }, 160);
    return () => window.clearTimeout(handle);
  }, [project?.rootPath, query, tab]);

  useEffect(() => {
    if (!project || tab !== "wiki") return;
    api.wiki(project.rootPath, "").then(setWikiCatalog).catch(() => setWikiCatalog([]));
  }, [project?.rootPath, tab]);

  useEffect(() => {
    if (!project || !task) {
      setHandoffText("");
      setPromptText("");
      return;
    }
    let cancelled = false;
    setDecisionDraft("");
    setNextDraft("");
    api
      .readHandoff(project.rootPath, task.id)
      .then((item) => {
        if (cancelled) return;
        setHandoffText(item.markdown);
        setPromptText(item.prompt || "");
        setDecisionDraft(handoffDraft(item.markdown, "Decisions"));
        setNextDraft(handoffDraft(item.markdown, "Next action"));
      })
      .catch(() => {
        if (!cancelled) {
          setHandoffText("");
          setPromptText("");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [project?.rootPath, task?.id]);

  useEffect(() => {
    const root = selectedLane?.worktreePath || project?.rootPath;
    if (!root || !project) return;
    const target = browsePath && browsePath.startsWith(root) ? browsePath : root;
    api.files(project.rootPath, target).then(setFiles).catch(() => setFiles([]));
  }, [project?.rootPath, selectedLane?.worktreePath, browsePath]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!project || settingsOpen || registerOpen) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const typing = isTypingTarget(event.target);
      const chord = shortcutFor(event.key, typing);
      if (chord?.kind === "wiki-search") {
        event.preventDefault();
        setTab("wiki");
        setWikiFocus((n) => n + 1);
        return;
      }
      if (chord?.kind === "tab") {
        event.preventDefault();
        setTab(chord.tab);
        if (chord.tab === "wiki") setWikiFocus((n) => n + 1);
        return;
      }
      if (chord?.kind === "view") {
        event.preventDefault();
        setView(chord.view);
        return;
      }
      if (chord?.kind === "next-hand") {
        event.preventDefault();
        goNextHandRef.current();
        return;
      }
      if (typing) return;
      if (tab === "wiki" && (event.key === "j" || event.key === "k" || event.key === "ArrowDown" || event.key === "ArrowUp")) {
        return;
      }
      const rows = view === "lanes" ? visibleTasks : forestLanes;
      if (event.key === "j" || event.key === "ArrowDown" || event.key === "k" || event.key === "ArrowUp") {
        event.preventDefault();
        const currentId = view === "forest" ? selectedLane?.id : task?.id;
        const index = rows.findIndex((item) => ("id" in item ? item.id : "") === currentId);
        const nextIndex = event.key === "j" || event.key === "ArrowDown"
          ? Math.min(rows.length - 1, index + 1)
          : Math.max(0, index - 1);
        const next = rows[nextIndex];
        if (!next) return;
        if (view !== "lanes") {
          const lane = next as RepoLane;
          setLaneId(lane.id);
          setTaskId(lane.taskId || null);
        } else {
          const nextTask = next as Task;
          setTaskId(nextTask.id);
          const match = map?.lanes.find((item) => item.taskId === nextTask.id);
          setLaneId(match?.id || null);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [project, view, tab, forestLanes, visibleTasks, selectedLane, task, map, settingsOpen, registerOpen]);

  async function run(action: () => Promise<void>) {
    if (busy) return;
    setError("");
    setBusy(true);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  function copy(label: string, value: string) {
    if (!value) return;
    void navigator.clipboard.writeText(value);
    setNotice("");
    setCopied(label);
    window.clearTimeout(copyTimer.current);
    copyTimer.current = window.setTimeout(() => setCopied(""), 2200);
  }

  function hint(message: string) {
    setCopied("");
    setNotice(message);
    window.clearTimeout(copyTimer.current);
    copyTimer.current = window.setTimeout(() => setNotice(""), 2800);
  }

  function goNextHand() {
    if (!project) return;
    const intent = nextHandIntent(loop);
    if (intent === "tree" && task) {
      setTab("task");
      run(async () => {
        const opened = await api.openTree(project.rootPath, task.id);
        await refresh(project.id, task.id);
        const recipe = openRecipe(appSettings?.openIn, opened.worktree.path);
        copy(`${recipe.label}，下一步登记心跳`, recipe.command);
      });
      return;
    }
    if (intent === "tree" && selectedLane && !selectedLane.worktreePath) {
      setTab("task");
      run(async () => {
        const planted = await api.plant(project.rootPath, selectedLane.branch);
        setBrowsePath(planted.path);
        await refresh(project.id, task?.id);
        const recipe = openRecipe(appSettings?.openIn, planted.path);
        copy(`${recipe.label}，下一步登记心跳`, recipe.command);
      });
      return;
    }
    if (intent === "pulse") {
      setTab("task");
      setPulseFocus((n) => n + 1);
      return;
    }
    if (intent === "handoff" || intent === "done") {
      setTab("handoff");
      return;
    }
    if (intent === "wiki") {
      setTab("wiki");
      setWikiFocus((n) => n + 1);
    }
  }
  goNextHandRef.current = goNextHand;

  const composeBar = project ? (
    <div className="compose">
      <input
        value={titleDraft}
        onChange={(event) => setTitleDraft(event.target.value)}
        placeholder="功能名，例如：修播放器进度条"
      />
      <input
        value={allowDraft}
        onChange={(event) => setAllowDraft(event.target.value)}
        placeholder="允许路径 app/**"
      />
      <label className="toggle-field">
        <span>动冻层</span>
        <button
          type="button"
          role="switch"
          className={frozenDraft ? "toggle on" : "toggle"}
          aria-checked={frozenDraft}
          onClick={() => setFrozenDraft((value) => !value)}
        />
      </label>
      {frozenDraft ? (
        <input
          className="reason"
          value={reasonDraft}
          onChange={(event) => setReasonDraft(event.target.value)}
          placeholder="开冻层理由（至少 4 个字）"
        />
      ) : null}
      <button
        className="primary"
        disabled={busy}
        onClick={() =>
          run(async () => {
            if (!titleDraft.trim()) throw new Error("先写功能名");
            if (frozenDraft && reasonDraft.trim().replace(/\s+/g, " ").length < 4) {
              throw new Error("开冻层必须写理由（至少 4 个字）");
            }
            const created = await api.createTask(
              project.rootPath,
              titleDraft.trim(),
              allowDraft.split(",").map((part) => part.trim()).filter(Boolean),
              frozenDraft,
              frozenDraft ? reasonDraft : undefined,
              { intent: intentDraft, baseBranch: (baseDraft || project.baseBranch) },
            );
            setTitleDraft("");
            setReasonDraft("");
            setFrozenDraft(false);
            setIntentDraft("feat");
            setBaseDraft("");
            await refresh(project.id, created.task.id);
            setView("lanes");
            setTab("task");
            setComposeOpen(false);
            hint("下一步：对照里创建 worktree");
          })
        }
      >
        新任务
      </button>
      <div className="compose-meta">
        <div className="seg" role="radiogroup" aria-label="意图">
          {([
            ["feat", "功能"],
            ["spike", "试探"],
            ["hotfix", "热修"],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={intentDraft === id ? "on" : ""}
              onClick={() => setIntentDraft(id)}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="compose-base">
          <span>基线</span>
          <select value={baseDraft || project.baseBranch} onChange={(event) => setBaseDraft(event.target.value)}>
            <option value={project.baseBranch}>{project.baseBranch}</option>
            {[...new Set((map?.lanes || []).map((item) => item.branch))]
              .filter((branch) => branch && branch !== project.baseBranch && !branch.startsWith("origin/"))
              .map((branch) => (
                <option key={branch} value={branch}>
                  {branch}
                </option>
              ))}
          </select>
        </label>
        <small>
          {(intentDraft === "spike" ? "试探" : intentDraft === "hotfix" ? "热修" : "功能")} · 先建卡，不种树
        </small>
      </div>
    </div>
  ) : null;

  return (
    <div
      className="mac"
      data-skin={appSettings?.skin || "lean"}
      data-motion={appSettings?.motion || "system"}
      data-decor={appSettings?.forgeDecor === "on" ? "on" : "off"}
      ref={shellRef}
    >
      <header className="titlebar">
        <div className="identity">
          {grouped.find((item) => item.id === groupId)?.name || groupId}
          <em> / </em>
          {project?.name || "—"}
        </div>
        <div className="context">
          {VIEW_LABEL[view]}
          {selectedLane?.branch ? ` · ${selectedLane.branch}` : task?.title ? ` · ${task.title}` : ""}
        </div>
        <div className="home">
          {project && pendingCount > 0 ? (
            <button className="badge" onClick={() => setTab("charter")}>
              {pendingCount} 项待批准
            </button>
          ) : null}
          <span className="actor">人</span>
          <span className={snap ? (drift.length ? "engine on drift" : "engine on") : "engine"} title={drift.length ? "AGENTS.md 托管段已漂移" : "引擎"} />
          <button className="sliders" title="设置" onClick={() => setSettingsOpen(true)} aria-label="设置">
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
              <path d="M5 9h18M5 14h18M5 19h18" stroke="currentColor" strokeWidth="1.25" />
              <circle cx="19" cy="9" r="2.2" fill="currentColor" />
              <circle cx="10" cy="14" r="2.2" fill="currentColor" />
              <circle cx="16" cy="19" r="2.2" fill="currentColor" />
            </svg>
          </button>
        </div>
      </header>

      <div className="split">
        <aside className="sidebar">
          <p className="brand">
            工区 <span>Agent Workzoon</span>
          </p>
          {grouped.map((group) => (
            <section key={group.id}>
              <button className={group.id === groupId ? "group on" : "group"} onClick={() => setGroupId(group.id)}>
                {group.name}
              </button>
              {group.projects.map((item) => {
                const itemMap = snap?.maps.find((entry) => entry.rootPath === item.rootPath);
                return (
                  <button
                    key={item.id}
                    className={item.id === project?.id ? "project on" : "project"}
                    onClick={() => {
                      setProjectId(item.id);
                      setTaskId(item.tasks[0]?.id || null);
                      setLaneId(itemMap?.lanes[0]?.id || null);
                      setBrowsePath("");
                      setTab("task");
                      setView("holdings");
                    }}
                  >
                    <strong>{item.name}</strong>
                    <small>
                      {item.baseBranch} · {liveBayCount(itemMap?.lanes || [], item.rootPath)} 棵树 · {item.tasks.filter((entry) => entry.status === "active").length} 进行中
                    </small>
                  </button>
                );
              })}
            </section>
          ))}
          <button type="button" className="add" onClick={() => setRegisterOpen(true)}>
            + 登记仓
          </button>
        </aside>

        <main className="content" ref={contentRef} data-view={view}>
          {appSettings?.skin === "forge" && appSettings?.forgeDecor === "on" ? (
            <div className="parallax-sky" aria-hidden>
              <i className="layer far" />
            </div>
          ) : null}
          {!snap && error ? (
            <EngineDown />
          ) : !snap ? (
            <Empty title="正在连接引擎…" />
          ) : !project ? (
            <Empty title="还没有仓库" body="点左下「+ 登记仓」把仓库加进来。工区会列出每条分支、每棵树，并整理一本给助手读的百科。" />
          ) : (
            <>
              <RepoTrunk project={project} onCopy={copy} />
              <div className="toolbar">
                <div className="filters" role="tablist">
                  {(["holdings", "forest", "lanes"] as View[]).map((item) => (
                    <button key={item} className={view === item ? "on" : ""} onClick={() => setView(item)}>
                      {VIEW_LABEL[item]}
                    </button>
                  ))}
                </div>
                <div className="toolbar-end">
                  {view !== "holdings" ? (
                    <div className="filters" role="tablist">
                      {(["all", "active", "review", "done", "hygiene", "undeclared"] as Filter[]).map((item) => (
                        <button
                          key={item}
                          className={filter === item ? "on" : ""}
                          title={FILTER_TITLE[item]}
                          onClick={() => setFilter(item)}
                        >
                          {FILTER_LABEL[item]}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  <button
                    type="button"
                    className={composeOpen ? "ghost on" : "ghost"}
                    onClick={() => {
                      setComposeOpen((value) => !value);
                      setView("lanes");
                    }}
                  >
                    + 新任务
                  </button>
                </div>
              </div>
              {composeOpen ? composeBar : null}

              <div className="scene" ref={sceneRef} data-scene={view}>
              {view === "holdings" ? (
                <>
                  <div ref={boardRef}>
                    <GaugeStrip
                      branchCount={map?.lanes.length || 0}
                      treeCount={liveBayCount(map?.lanes || [], project.rootPath)}
                      taskCount={project.tasks.length}
                      artifactCount={holdings?.artifacts.length || 0}
                      uncheckedCount={uncheckedCount}
                      taskStats={taskStats}
                      hygieneCount={(map?.lanes || []).filter((item) => (item.hygiene?.length || 0) > 0).length}
                      undeclaredCount={(map?.lanes || []).filter((item) => item.undeclared).length}
                      onOpenForest={() => {
                        setView("forest");
                        setTab("task");
                      }}
                      onOpenHygiene={() => {
                        setView("forest");
                        setFilter("hygiene");
                      }}
                      onOpenUndeclared={() => {
                        setView("forest");
                        setFilter("undeclared");
                      }}
                      onOpenLanes={() => {
                        setView("lanes");
                        setTab("task");
                      }}
                      onOpenArtifacts={() => {
                        const first = holdings?.artifacts[0];
                        if (first) setBrowsePath(first.kind === "dir" ? first.path : first.checkout);
                        setTab("holdings");
                      }}
                    />
                    <div className="panels">
                      <HoldingsSource project={project} holdings={holdings} onCopy={copy} />
                      <ProcessStrip
                        view={strip}
                        focus={stripFocus}
                        onStep={(step) => {
                          setStripFocus(step);
                          bumpFocus();
                          if (step === "repo") {
                            setTab("holdings");
                            return;
                          }
                          if (step === "branch" || step === "worktree") {
                            setView("forest");
                            setTab("task");
                            return;
                          }
                          setTab("holdings");
                        }}
                      />
                    </div>
                    <OnDutySat
                      rows={dutyRows}
                      onOpen={(id) => {
                        setTaskId(id);
                        const match = map?.lanes.find((lane) => lane.taskId === id);
                        if (match) setLaneId(match.id);
                        setView("lanes");
                        setTab("task");
                        bumpFocus();
                      }}
                    />
                  </div>
                </>
              ) : view === "forest" ? (
                forestLanes.length === 0 ? (
                  filter !== "all" ? (
                    <FilteredEmpty />
                  ) : (
                    <Empty title="还看不到分支" body="登记仓之后，这里会列出每一条分支和每一棵树。" />
                  )
                ) : (
                  <>
                  <WorktreeDeck
                    lanes={forestLanes}
                    rootPath={project.rootPath}
                    nextOf={(item) => {
                      const bound = project?.tasks.find((entry) => entry.id === item.taskId);
                      const row = occupancyRows.find((entry) => entry.taskId === item.taskId);
                      return loopForLane(item, bound, row, project?.rootPath)?.verb || null;
                    }}
                    selectedId={selectedLane?.id}
                    onCopyPath={(path) => copy("路径已复制", path)}
                    onSelect={(item) => {
                      setLaneId(item.id);
                      setTaskId(item.taskId || null);
                      setBrowsePath(item.worktreePath || "");
                      setTab("task");
                      bumpFocus();
                    }}
                  />
                  <ul className="forest" ref={listRef}>
                    <li className="lane head forest-row" aria-hidden>
                      <span />
                      <span>分支</span>
                      <span>路径</span>
                      <span>归属</span>
                      <span>动作</span>
                    </li>
                    {groupedForest.map((group) => (
                      <Fragment key={group.prefix}>
                        <li className="lane-group">
                          {group.prefix}/ · {group.lanes.length}
                        </li>
                        {group.lanes.map((item, index) => (
                          <ForestRow
                            key={item.id}
                            lane={item}
                            pinCount={(holdings?.versions || []).filter((version) => version.branch === item.branch).length}
                            selected={item.id === selectedLane?.id}
                            index={index}
                            canDelete={!item.worktreePath && !item.isRemote && item.branch !== project.baseBranch}
                            confirmDestructive={appSettings?.confirmDestructive !== false}
                            confirmValue={confirmBranch}
                            deleting={deleteFor === item.id}
                            onConfirmValue={setConfirmBranch}
                            onAskDelete={() => {
                              setDeleteFor(item.id);
                              setConfirmBranch("");
                            }}
                            onCancelDelete={() => {
                              setDeleteFor(null);
                              setConfirmBranch("");
                            }}
                            onSelect={() => {
                              setLaneId(item.id);
                              setTaskId(item.taskId || null);
                              setBrowsePath(item.worktreePath || "");
                              setTab("task");
                              bumpFocus();
                            }}
                            onCopy={copy}
                            onDelete={() =>
                              run(async () => {
                                await api.deleteBranch(project.rootPath, item.branch, false, confirmBranch || item.branch);
                                setConfirmBranch("");
                                setDeleteFor(null);
                                await refresh(project.id, task?.id);
                              })
                            }
                          />
                        ))}
                      </Fragment>
                    ))}
                  </ul>
                  </>
                )
              ) : visibleTasks.length === 0 ? (
                filter !== "all" ? (
                  <FilteredEmpty />
                ) : (
                  <Empty title="还没有任务" body="先建卡：选意图和基线。要独立工作区时再创建 worktree。一条任务一棵树。" />
                )
              ) : (
                <ul className="lanes" ref={listRef}>
                  <li className="lane head" aria-hidden>
                    <span>功能</span>
                    <span>分支</span>
                    <span>路径</span>
                    <span>状态</span>
                  </li>
                  {visibleTasks.map((item, index) => (
                    <LaneRow
                      key={item.id}
                      project={project}
                      task={item}
                      occupancy={occupancyRows.find((row) => row.taskId === item.id)}
                      hygiene={map?.lanes.find((lane) => lane.taskId === item.id)?.hygiene}
                      selected={item.id === task?.id}
                      index={index}
                      onSelect={() => {
                        setTaskId(item.id);
                        const match = map?.lanes.find((lane) => lane.taskId === item.id);
                        if (match) setLaneId(match.id);
                        setTab("task");
                        bumpFocus();
                      }}
                      onCopy={copy}
                    />
                  ))}
                </ul>
              )}
              </div>
            </>
          )}
        </main>

        <aside className="inspector" ref={inspectorRef}>
          <nav className="tabs">
            {(["holdings", "task", "charter", "handoff", "blast", "wiki"] as Tab[]).map((item) => (
              <button
                key={item}
                className={tab === item ? "on" : ""}
                title={TAB_HINT[item]}
                onClick={() => setTab(item)}
              >
                {TAB_LABEL[item]}
              </button>
            ))}
          </nav>
          <div key={tab} className="pane-shell" ref={paneRef}>
            {!snap && error ? <EngineDown /> : null}
            {tab === "charter" && project && (
              <CharterPane
                project={project}
                drift={drift}
                requests={(snap?.requests || []).filter((item) => item.rootPath === project.rootPath)}
                busy={busy}
                onSync={() =>
                  run(async () => {
                    await api.sync(project.rootPath);
                    await refresh(project.id, task?.id);
                  })
                }
                onDecide={(id, approve) =>
                  run(async () => {
                    await api.decide(project.rootPath, id, approve);
                    await refresh(project.id, task?.id);
                  })
                }
                onPolicy={(partial) =>
                  run(async () => {
                    await api.updatePolicy(project.rootPath, partial);
                    await refresh(project.id, task?.id);
                  })
                }
              />
            )}
            {tab === "holdings" && project && (
              <HoldingsPane
                holdings={holdings}
                lane={selectedLane}
                focusBranch={stripFocus === "artifact" ? selectedLane?.branch : undefined}
                ledger={(snap?.ledgerTail || []).find((item) => item.rootPath === project.rootPath)?.lines || []}
                busy={busy}
                onCopy={copy}
                onPin={(name, checkout) =>
                  run(async () => {
                    await api.pin(project.rootPath, name, checkout);
                    await refresh(project.id, task?.id);
                  })
                }
                onUnpin={(id) =>
                  run(async () => {
                    await api.unpin(project.rootPath, id);
                    await refresh(project.id, task?.id);
                  })
                }
                confirmDestructive={appSettings?.confirmDestructive !== false}
                archiveName={selectedLane?.branch || task?.slug || ""}
                onArchive={
                  task?.worktreeId
                    ? (confirm) =>
                        run(async () => {
                          await api.archive(project.rootPath, task.id, confirm);
                          await refresh(project.id, task.id);
                        })
                    : undefined
                }
              />
            )}
            {tab === "task" && project && (
              <MapPane
                project={project}
                task={task}
                occupancy={selectedOccupancy}
                loop={loop}
                lane={selectedLane}
                files={files}
                browsePath={browsePath || selectedLane?.worktreePath || project.rootPath}
                busy={busy}
                onCopy={copy}
                onBrowse={setBrowsePath}
                pulseFocus={pulseFocus}
                onFocusPulse={() => setPulseFocus((n) => n + 1)}
                onLoop={(step) => {
                  if (step === "pulse") setPulseFocus((n) => n + 1);
                  if (step === "handoff" || step === "done") {
                    setTab(step === "done" && loop?.verb === "写进百科" ? "wiki" : "handoff");
                    return;
                  }
                  setTab("task");
                }}
                onOpen={
                  task
                    ? () =>
                        run(async () => {
                          const opened = await api.openTree(project.rootPath, task.id);
                          await refresh(project.id, task.id);
                          const recipe = openRecipe(appSettings?.openIn, opened.worktree.path);
                          copy(`${recipe.label}，下一步登记心跳`, recipe.command);
                        })
                    : undefined
                }
                onPlant={
                  selectedLane && !selectedLane.worktreePath
                    ? () =>
                        run(async () => {
                          const planted = await api.plant(project.rootPath, selectedLane.branch);
                          setBrowsePath(planted.path);
                          await refresh(project.id, task?.id);
                          const recipe = openRecipe(appSettings?.openIn, planted.path);
                          copy(`${recipe.label}，下一步登记心跳`, recipe.command);
                        })
                    : undefined
                }
                openIn={appSettings?.openIn || "cursor"}
                onPulse={
                  task
                    ? (doing, cite, remainMin) =>
                        run(async () => {
                          await api.pulse(project.rootPath, task.id, doing, cite, remainMin);
                          await refresh(project.id, task.id);
                          hint("下一步：写交接");
                        })
                    : undefined
                }
                onClearPulse={
                  task
                    ? () =>
                        run(async () => {
                          await api.clearPulse(project.rootPath, task.id);
                          await refresh(project.id, task.id);
                        })
                    : undefined
                }
              />
            )}
            {tab === "handoff" && project && task && (
              <HandoffPane
                decisionDraft={decisionDraft}
                nextDraft={nextDraft}
                handoffText={handoffText}
                promptText={promptText}
                loop={loop}
                busy={busy}
                onOpen={
                  task
                    ? () =>
                        run(async () => {
                          const opened = await api.openTree(project.rootPath, task.id);
                          await refresh(project.id, task.id);
                          const recipe = openRecipe(appSettings?.openIn, opened.worktree.path);
                          copy(`${recipe.label}，下一步登记心跳`, recipe.command);
                          setTab("task");
                        })
                    : undefined
                }
                onLoop={(step) => {
                  if (step === "pulse") setPulseFocus((n) => n + 1);
                  if (step === "handoff" || step === "done") {
                    setTab(step === "done" && loop?.verb === "写进百科" ? "wiki" : "handoff");
                    return;
                  }
                  setTab("task");
                }}
                onDecision={setDecisionDraft}
                onNext={setNextDraft}
                onGenerate={() => {
                  if (!decisionDraft.trim() || !nextDraft.trim()) {
                    hint("写上决定和下一步，再生成交接。");
                    return;
                  }
                  run(async () => {
                    const result = await api.handoff(project.rootPath, task.id, decisionDraft, nextDraft);
                    setHandoffText(result.markdown);
                    setPromptText(result.prompt);
                    setBlast(result.blast);
                    await refresh(project.id, task.id);
                    hint("下一步：标记完成");
                  });
                }}
                onDone={() =>
                  run(async () => {
                    await api.done(project.rootPath, task.id);
                    await refresh(project.id, task.id);
                    setTab("task");
                    hint("已完成");
                  })
                }
              />
            )}
            {tab === "wiki" && project && (
              <WikiPane
                pages={pages}
                catalog={wikiCatalog}
                page={wikiPage}
                lint={lint}
                query={query}
                ingestTitle={ingestTitle}
                ingestBody={ingestBody}
                busy={busy}
                searchFocus={wikiFocus}
                onQuery={setQuery}
                onTitle={setIngestTitle}
                onBody={setIngestBody}
                onCopy={copy}
                onOpen={(path) =>
                  run(async () => {
                    setWikiPage(await api.wikiPage(project.rootPath, path));
                  })
                }
                onFollow={(target) =>
                  run(async () => {
                    const hay = wikiCatalog.length ? wikiCatalog : await api.wiki(project.rootPath, "");
                    if (!wikiCatalog.length) setWikiCatalog(hay);
                    const match = resolveWikiLink(hay, target);
                    if (match) {
                      setWikiPage(await api.wikiPage(project.rootPath, match.path));
                      if (!pages.some((item) => item.path === match.path)) setQuery("");
                    } else setQuery(target);
                  })
                }
                onLint={() =>
                  run(async () => {
                    setLint(await api.wikiLint(project.rootPath));
                  })
                }
                onIngest={() =>
                  run(async () => {
                    if (!ingestTitle.trim() || !ingestBody.trim()) throw new Error("先写标题和原文");
                    await api.ingest(project.rootPath, ingestTitle.trim(), ingestBody.trim());
                    setIngestTitle("");
                    setIngestBody("");
                    setPages(await api.wiki(project.rootPath, query));
                    setWikiCatalog(await api.wiki(project.rootPath, ""));
                  })
                }
                onWrite={(bucket) =>
                  run(async () => {
                    if (!ingestTitle.trim() || !ingestBody.trim()) throw new Error("先写标题和正文");
                    await api.wikiWrite(project.rootPath, bucket, ingestTitle.trim(), ingestBody.trim());
                    setPages(await api.wiki(project.rootPath, query));
                    setWikiCatalog(await api.wiki(project.rootPath, ""));
                    setLint(await api.wikiLint(project.rootPath));
                  })
                }
              />
            )}
            {tab === "blast" && project && task && (
              <BlastPane
                blast={blast}
                busy={busy}
                onCheck={() =>
                  run(async () => {
                    setBlast(await api.blast(project.rootPath, task.id));
                  })
                }
              />
            )}
            {tab === "handoff" && project && !task && <Empty title="先选一条有任务的车道" body="没有任务的分支仍可复制路径；交接跟任务绑定。" />}
          </div>
        </aside>
      </div>

      {error || copied || notice ? (
        <div className={copied || (notice && !error) ? "toast ok" : "toast"} ref={toastRef}>
          {copied ? `已复制 ${copied}` : notice || error}
        </div>
      ) : null}
      {settingsOpen ? (
        <SettingsSheet
          settings={appSettings}
          onClose={() => setSettingsOpen(false)}
          onSave={(partial) =>
            run(async () => {
              const next = await api.updateSettings(partial);
              setAppSettings(next);
              setSettingsOpen(false);
            })
          }
        />
      ) : null}
      {registerOpen ? (
        <RegisterSheet
          nameDraft={nameDraft}
          rootDraft={rootDraft}
          busy={busy}
          onName={setNameDraft}
          onRoot={setRootDraft}
          onClose={() => setRegisterOpen(false)}
          onSubmit={() =>
            run(async () => {
              if (!rootDraft.trim()) throw new Error("先填仓库最外面那一层的路径");
              const created = await api.init(rootDraft.trim(), nameDraft.trim() || rootDraft.trim(), groupId);
              setRegisterOpen(false);
              await refresh(created.id);
            })
          }
        />
      ) : null}
    </div>
  );
}

const ForestRow = memo(function ForestRow({
  lane,
  selected,
  index,
  pinCount,
  canDelete,
  confirmDestructive,
  confirmValue,
  deleting,
  onConfirmValue,
  onAskDelete,
  onCancelDelete,
  onSelect,
  onCopy,
  onDelete,
}: {
  lane: RepoLane;
  selected: boolean;
  index: number;
  pinCount?: number;
  canDelete?: boolean;
  confirmDestructive?: boolean;
  confirmValue?: string;
  deleting?: boolean;
  onConfirmValue?: (value: string) => void;
  onAskDelete?: () => void;
  onCancelDelete?: () => void;
  onSelect: () => void;
  onCopy: (label: string, value: string) => void;
  onDelete?: () => void;
}) {
  const dot = lane.worktreePath ? "gov" : lane.isRemote ? "hollow" : "idle";
  return (
    <li data-rise style={{ "--i": index } as never}>
      <div
        className={selected ? "lane forest-row on" : "lane forest-row"}
        role="button"
        tabIndex={0}
        onClick={onSelect}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") onSelect();
        }}
      >
        <span className="rail">
          <span className={`dot ${dot}`} />
        </span>
        <span className="cell feature">
          <span>
            <strong>{lane.taskTitle || lane.branch}</strong>
            {lane.baseBranch ? (
              <span className="tag idle" title="这条树从这条基线长出来">
                基线 {lane.baseBranch}
              </span>
            ) : null}
            {pinCount ? <span className="tag">{pinCount} 版产物</span> : null}
            <small>
              {lane.taskTitle ? (
                <>
                  {lane.branch}
                  {lane.isHead ? " · 当前检出" : ""}
                  {lane.isRemote ? " · 远程" : ""}
                </>
              ) : (
                <>
                  {lane.isHead ? "当前检出" : ""}
                  {lane.isRemote ? `${lane.isHead ? " · " : ""}远程` : ""}
                </>
              )}
              {lane.undeclared ? <span className="tag stop">清单外</span> : null}
              <HygieneTags kinds={lane.hygiene} />
            </small>
          </span>
        </span>
        <button
          type="button"
          className="cell path"
          title={lane.worktreePath ? `复制 ${lane.worktreePath}` : "还没有自己的目录"}
          onClick={(event) => {
            event.stopPropagation();
            if (lane.worktreePath) onCopy("路径", lane.worktreePath);
            else onCopy("分支", lane.branch);
          }}
        >
          {lane.worktreePath ? shorten(lane.worktreePath) : "未检出"}
        </button>
        <span className={`cell status ${lane.taskStatus || ""}`}>
          {lane.taskTitle || (lane.managed ? "任务" : lane.worktreePath ? "检出" : "分支")}
        </span>
        <span className={deleting ? "row-actions open" : "row-actions"} onClick={(event) => event.stopPropagation()}>
          {canDelete && onDelete ? (
            <>
              <button type="button" className="text danger" onClick={onAskDelete}>
                删除
              </button>
              {deleting ? (
                <div className="popover">
                  {confirmDestructive ? (
                    <input
                      value={confirmValue || ""}
                      placeholder="输入分支名"
                      onChange={(event) => onConfirmValue?.(event.target.value)}
                    />
                  ) : null}
                  <button
                    type="button"
                    className="danger"
                    disabled={Boolean(confirmDestructive && confirmValue !== lane.branch)}
                    onClick={() => {
                      if (confirmDestructive && confirmValue !== lane.branch) return;
                      onDelete();
                    }}
                  >
                    删除分支
                  </button>
                  <button type="button" className="text" onClick={onCancelDelete}>
                    取消
                  </button>
                </div>
              ) : null}
            </>
          ) : null}
        </span>
      </div>
    </li>
  );
});

function HygieneTags({ kinds }: { kinds?: HygieneKind[] }) {
  if (!kinds?.length) return null;
  const label: Record<HygieneKind, string> = {
    merged: "已合入",
    stale: "14 天无动",
    "no-handoff": "缺交接",
  };
  return (
    <>
      {kinds.map((kind) => (
        <span key={kind} className={kind === "no-handoff" ? "tag stop" : "tag idle"}>
          {label[kind]}
        </span>
      ))}
    </>
  );
}

const LaneRow = memo(function LaneRow({
  project,
  task,
  occupancy,
  hygiene,
  selected,
  index,
  onSelect,
  onCopy,
}: {
  project: Project;
  task: Task;
  occupancy?: Occupancy;
  hygiene?: HygieneKind[];
  selected: boolean;
  index: number;
  onSelect: () => void;
  onCopy: (label: string, value: string) => void;
}) {
  const lane = laneOf(project, task);
  return (
    <li data-rise style={{ "--i": index } as never}>
      <div
        className={selected ? "lane on" : "lane"}
        role="button"
        tabIndex={0}
        onClick={onSelect}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") onSelect();
        }}
      >
        <span className="cell feature">
          <span className={`dot ${task.status}`} />
          <span>
            <strong>{task.title}</strong>
            <small>
              {occupancy?.agent || task.agent}
              {task.allowFrozenTouch ? (
                <span title={task.escalation?.reason || "没有记下破例理由"}> · 破例</span>
              ) : (
                ""
              )}
              <HygieneTags kinds={hygiene} />
            </small>
          </span>
        </span>
        <button
          type="button"
          className="cell mono"
          title={`复制 ${lane.branch}`}
          onClick={(event) => {
            event.stopPropagation();
            onCopy("分支", lane.branch);
          }}
        >
          {lane.branch}
        </button>
        <button
          type="button"
          className="cell path"
          title={lane.path ? `复制 ${lane.path}` : "这张卡还没有自己的目录"}
          onClick={(event) => {
            event.stopPropagation();
            if (lane.path) onCopy("路径", lane.path);
          }}
        >
          {lane.path ? shorten(lane.path) : "未创建"}
        </button>
        <span className={`cell status ${task.status}`}>{STATUS[task.status]}</span>
      </div>
      {occupancy ? <OccupancyStrip occupancy={occupancy} /> : null}
    </li>
  );
});

function PulseBox({
  occupancy,
  sha,
  citeRoots,
  busy,
  citeHint,
  focusNonce,
  primary,
  onPulse,
  onClear,
}: {
  occupancy?: Occupancy;
  sha: string;
  citeRoots: string[];
  busy: boolean;
  citeHint?: { kind: "path" | "sha"; value: string; nonce: number };
  focusNonce?: number;
  primary?: boolean;
  onPulse: (doing: string, cite: { kind: "path" | "sha"; value: string }, remainMin?: number) => void;
  onClear?: () => void;
}) {
  const doingRef = useRef<HTMLInputElement>(null);
  const [doing, setDoing] = useState(occupancy?.doingFrom === "pulse" ? occupancy.doing : "");
  const [remain, setRemain] = useState(occupancy?.pulse?.remainMin ? String(occupancy.pulse.remainMin) : "");
  const [citeKind, setCiteKind] = useState<"path" | "sha">(occupancy?.pulse?.cite.kind || (sha ? "sha" : "path"));
  const [citeValue, setCiteValue] = useState(occupancy?.pulse?.cite.value || sha);
  const seededSha = useRef(Boolean(occupancy?.pulse?.cite.value || sha));
  useEffect(() => {
    if (seededSha.current || !sha) return;
    setCiteValue((current) => current || sha);
    seededSha.current = true;
  }, [sha]);
  useEffect(() => {
    if (!citeHint) return;
    setCiteKind(citeHint.kind);
    setCiteValue(citeHint.value);
  }, [citeHint?.nonce]);
  useEffect(() => {
    if (focusNonce) doingRef.current?.focus();
  }, [focusNonce]);
  return (
    <div className="pulse-box">
      <p className="eyebrow">心跳</p>
      <input
        ref={doingRef}
        value={doing}
        onChange={(event) => setDoing(event.target.value)}
        placeholder="正在做（不要写 %）"
      />
      <div className="pulse-cite">
        <select value={citeKind} onChange={(event) => setCiteKind(event.target.value as "path" | "sha")}>
          <option value="sha">版本号</option>
          <option value="path">路径</option>
        </select>
        <input
          value={citeValue}
          onChange={(event) => setCiteValue(event.target.value)}
          placeholder={citeKind === "sha" ? "现在的版本，或更早的一版" : "这次改动里的文件"}
        />
        <input
          value={remain}
          onChange={(event) => setRemain(event.target.value)}
          placeholder="估 分"
          inputMode="numeric"
        />
      </div>
      <div className="row">
        <button
          className={primary ? "primary" : ""}
          disabled={busy}
          onClick={() =>
            onPulse(
              doing.trim(),
              {
                kind: citeKind,
                value: citeKind === "sha" ? citeValue.trim().replace(/^@/, "") : relCite(citeValue.trim(), ...citeRoots),
              },
              remain ? Number(remain) : undefined,
            )
          }
        >
          登记
        </button>
        {onClear ? (
          <button disabled={busy} onClick={onClear}>
            清除
          </button>
        ) : null}
      </div>
      <p className="hint">
        {citeValue.trim()
          ? "30 分钟后过期。请标这次改的文件，或标现在的版本。不写进交接。"
          : citeKind === "sha"
            ? "还没标是哪一版。点对照里的版本号，或点源码文件。"
            : "还没标到哪。点对照里的源码文件，或改用版本号。"}
      </p>
    </div>
  );
}

function OccupancyStrip({ occupancy }: { occupancy: Occupancy }) {
  return (
    <div className="lane-occupancy">
      <span className="doing" title={occupancy.doingFrom === "pulse" ? "心跳" : "正在做（推导，不是自报）"}>
        {occupancy.doing}
        {occupancy.pulse?.remainMin ? <span className="tag idle">估 {occupancy.pulse.remainMin} 分</span> : null}
      </span>
      <span className="evidence" title="证据格，不是完成度">
        <span className="evidence-cells" aria-hidden>
          {occupancy.evidence.map((cell) => (
            <i
              key={cell.id}
              className={cell.skipped ? "skip" : cell.lit ? (occupancy.doingFrom === "pulse" ? "on live" : "on") : ""}
              title={cell.label}
            />
          ))}
        </span>
        证据 {occupancy.lit}/{occupancy.denom}
      </span>
      <span className="idle">闲置 {formatIdle(occupancy.idleMs)}</span>
    </div>
  );
}

function GaugeStrip({
  branchCount,
  treeCount,
  taskCount,
  artifactCount,
  uncheckedCount,
  taskStats,
  hygieneCount,
  undeclaredCount,
  onOpenForest,
  onOpenHygiene,
  onOpenUndeclared,
  onOpenLanes,
  onOpenArtifacts,
}: {
  branchCount: number;
  treeCount: number;
  taskCount: number;
  artifactCount: number;
  uncheckedCount: number;
  taskStats: Record<Task["status"], number>;
  hygieneCount?: number;
  undeclaredCount?: number;
  onOpenForest: () => void;
  onOpenHygiene?: () => void;
  onOpenUndeclared?: () => void;
  onOpenLanes: () => void;
  onOpenArtifacts: () => void;
}) {
  const treePct = branchCount ? Math.min(100, (treeCount / branchCount) * 100) : 0;
  return (
    <div className="gauges">
      <button
        type="button"
        className="gauge"
        data-rise
        style={{ "--i": 0 } as never}
        onClick={undeclaredCount && onOpenUndeclared ? onOpenUndeclared : hygieneCount && onOpenHygiene ? onOpenHygiene : onOpenForest}
      >
        <p className="eyebrow">分支</p>
        <p className="gauge-num">{branchCount}</p>
        <div className="meter"><i style={{ width: branchCount ? "100%" : "0%" }} /></div>
        {uncheckedCount ? <p className="delta">{uncheckedCount} 条未检出</p> : null}
        {undeclaredCount ? <p className="delta">{undeclaredCount} 条清单外</p> : null}
        {hygieneCount ? <p className="delta">{hygieneCount} 条待清理</p> : null}
      </button>
      <button type="button" className="gauge" data-rise style={{ "--i": 1 } as never} onClick={onOpenForest}>
        <p className="eyebrow">树</p>
        <p className="gauge-num">{treeCount}</p>
        <p className="gauge-den">/ {branchCount}</p>
        <div className="meter"><i style={{ width: `${treePct}%` }} /></div>
      </button>
      <button type="button" className="gauge" data-rise style={{ "--i": 2 } as never} onClick={onOpenLanes}>
        <p className="eyebrow">任务</p>
        <p className="gauge-num">{taskCount}</p>
        <div className="meter task">
          {TASK_STATUSES.map((status) =>
            taskStats[status] ? <i key={status} className={`seg-${status}`} style={{ flexGrow: taskStats[status] }} /> : null,
          )}
        </div>
      </button>
      <button type="button" className="gauge" data-rise style={{ "--i": 3 } as never} onClick={onOpenArtifacts}>
        <p className="eyebrow">产物</p>
        <p className="gauge-num">{artifactCount}</p>
        <div className="meter"><i style={{ width: artifactCount ? "100%" : "0%" }} /></div>
      </button>
    </div>
  );
}

function HoldingsSource({
  project,
  holdings,
  onCopy,
}: {
  project: Project;
  holdings: Holdings | null;
  onCopy: (label: string, value: string) => void;
}) {
  const remotes = holdings?.remotes || [];
  return (
    <section data-rise style={{ "--i": 4 } as never}>
      <p className="eyebrow">来源</p>
      <ul className="notes">
        {remotes.length ? remotes.map((item) => (
          <li key={item.name}>
            <button className="link" onClick={() => onCopy("远程", item.url)}>
              {item.name} · {item.url}
            </button>
          </li>
        )) : <li>还没有远程</li>}
        <li>
          <button className="link" onClick={() => onCopy("基线分支", project.baseBranch)}>
            基线 · {project.baseBranch}
          </button>
        </li>
        <li>
          <button className="link" title={project.rootPath} onClick={() => onCopy("仓库路径", project.rootPath)}>
            主树 · {shorten(project.rootPath)}
          </button>
        </li>
      </ul>
    </section>
  );
}

function ProcessStrip({
  view,
  focus,
  onStep,
}: {
  view: ReturnType<typeof processStripView> | null;
  focus: ProcessStep;
  onStep: (step: ProcessStep) => void;
}) {
  return (
    <section data-rise style={{ "--i": 5 } as never}>
      <p className="eyebrow">工序</p>
      {view ? (
        <ol
          className="process-strip"
          style={{ "--strip-i": PROCESS_STEPS.findIndex((item) => item.id === focus) } as never}
        >
          {PROCESS_STEPS.map((step, index) => (
            <li key={step.id}>
              {index ? <span className="arrow" aria-hidden /> : null}
              <button
                type="button"
                className={focus === step.id ? "step on" : "step"}
                onClick={() => onStep(step.id)}
              >
                <em>{step.kicker}</em>
                <strong>{stripLabel(view, step.id)}</strong>
              </button>
            </li>
          ))}
        </ol>
      ) : (
        <p className="hint">读图中</p>
      )}
    </section>
  );
}

function OnDutySat({
  rows,
  onOpen,
}: {
  rows: Occupancy[];
  onOpen: (taskId: string) => void;
}) {
  if (!rows.length) return null;
  return (
    <section className="onduty" data-rise style={{ "--i": 6 } as never}>
      <p className="eyebrow">在岗</p>
      <ul className="notes">
        {rows.map((row) => (
          <li key={row.taskId}>
            <button type="button" className={row.pulse ? "link live" : "link"} onClick={() => onOpen(row.taskId)}>
              <strong>{row.agent}</strong>
              <span> · {row.doing}</span>
              {row.pulse?.remainMin ? <span className="tag idle">估 {row.pulse.remainMin} 分</span> : null}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function HoldingsPane({
  holdings,
  lane,
  focusBranch,
  ledger,
  busy,
  confirmDestructive,
  archiveName,
  onCopy,
  onPin,
  onUnpin,
  onArchive,
}: {
  holdings: Holdings | null;
  lane: RepoLane | null;
  focusBranch?: string;
  ledger: string[];
  busy: boolean;
  confirmDestructive?: boolean;
  archiveName?: string;
  onCopy: (label: string, value: string) => void;
  onPin?: (name: string, checkout: string) => void;
  onUnpin?: (id: string) => void;
  onArchive?: (confirm: string) => void;
}) {
  const [archiveFor, setArchiveFor] = useState(false);
  const [archiveTyped, setArchiveTyped] = useState("");
  const versions = holdings?.versions || [];
  const ranked = focusBranch
    ? [...versions].sort((a, b) => Number(b.branch === focusBranch) - Number(a.branch === focusBranch))
    : versions;
  return (
    <div className="pane">
      <h2>人掌控，Agent 遵守</h2>
      <p className="hint">仓、分支、目录和产物都记在工区里。钉住的是记录，不把文件拷进分支。</p>
      {lane ? (
        <ol className="map">
          <li>
            <em>分支</em>
            <button className="link" onClick={() => onCopy("分支", lane.branch)}>{lane.branch}</button>
          </li>
          <li>
            <em>路径</em>
            <button
              className="link"
              title={lane.worktreePath || undefined}
              onClick={() => lane.worktreePath && onCopy("路径", lane.worktreePath)}
            >
              {lane.worktreePath ? shorten(lane.worktreePath) : "未检出"}
            </button>
          </li>
        </ol>
      ) : null}
      {onArchive ? (
        <div className="row">
          <button type="button" disabled={busy} onClick={() => setArchiveFor(true)}>
            归档 worktree
          </button>
          {archiveFor ? (
            <div className="popover">
              {confirmDestructive ? (
                <input
                  value={archiveTyped}
                  placeholder={`输入 ${archiveName || "分支名"}`}
                  onChange={(event) => setArchiveTyped(event.target.value)}
                />
              ) : null}
              <button
                type="button"
                className="danger"
                disabled={Boolean(confirmDestructive && archiveTyped !== archiveName)}
                onClick={() => {
                  if (confirmDestructive && archiveTyped !== archiveName) return;
                  onArchive(archiveTyped || archiveName || "");
                  setArchiveFor(false);
                  setArchiveTyped("");
                }}
              >
                确认归档
              </button>
              <button
                type="button"
                className="text"
                onClick={() => {
                  setArchiveFor(false);
                  setArchiveTyped("");
                }}
              >
                取消
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
      <h3>产物</h3>
      <ul className="notes">
        {(holdings?.artifacts || []).map((item) => (
          <li key={item.path}>
            <button className="link" onClick={() => onCopy("产物", item.path)}>
              <strong>{item.name}</strong>
            </button>
            <small>
              {item.ignored ? "已忽略" : "已跟踪"}
              {item.branch ? ` · 在 ${item.branch}` : ""}
              {item.sha ? ` · 版本 ${item.sha.slice(0, 12)}` : ""}
              {item.pinnedId ? " · 已钉这一版" : ""}
            </small>
            {onPin ? (
              <div className="row">
                <button type="button" disabled={busy} onClick={() => onPin(item.name, item.checkout)}>
                  钉这一版
                </button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      <h3>版本</h3>
      <ul className="notes">
        {ranked.length ? ranked.map((item) => (
          <li key={item.id} className={focusBranch && item.branch === focusBranch ? "on" : undefined}>
            <button className="link" onClick={() => onCopy("产物版本", item.id)}>
              <strong>{item.name}</strong> 版本 {item.sha.slice(0, 12)}
            </button>
            <small>
              {item.branch}
              {" · "}
              <span className={item.state === "missing" ? "tag stop" : item.state === "changed" ? "tag idle" : "tag"}>
                {pinStateLabel(item.state)}
              </span>
              {item.onBranch ? "" : " · 不在这支"}
              {item.behind ? ` · 落后 ${item.behind}` : ""}
              {item.dirty ? " · 有未保存" : ""}
              {item.note ? ` · ${item.note}` : ""}
            </small>
            {onUnpin ? (
              <div className="row">
                <button type="button" disabled={busy} onClick={() => onUnpin(item.id)}>
                  取消钉
                </button>
              </div>
            ) : null}
          </li>
        )) : <li>还没有钉住的版本</li>}
      </ul>
      {holdings?.markdown ? (
        <details className="policy-details">
          <summary>原始记录</summary>
          <p className="hint">这是给助手看的清单文件。上面的产物和版本已经够用。</p>
          <pre>{holdings.markdown}</pre>
        </details>
      ) : null}
      <LedgerTail lines={ledger} />
    </div>
  );
}

function RepoTrunk({
  project,
  onCopy,
}: {
  project: Project;
  onCopy: (label: string, value: string) => void;
}) {
  return (
    <div className="trunk">
      <div>
        <p className="eyebrow">代码仓库</p>
        <h1>{project.name}</h1>
        <p className="crumb">
          <button className="chip" title={project.rootPath} onClick={() => onCopy("仓库路径", project.rootPath)}>
            {shorten(project.rootPath)}
          </button>
          <span className="arrow" />
          <button className="chip" onClick={() => onCopy("基线分支", project.baseBranch)}>
            {project.baseBranch}
          </button>
        </p>
      </div>
    </div>
  );
}

function handoffDraft(markdown: string, heading: string): string {
  const match = markdown.match(new RegExp(`^## ${heading}\\s*\\n([\\s\\S]*?)(?=^## |$)`, "m"));
  const text = (match?.[1] || "").replace(/^[-*]\s*/gm, "").trim();
  if (!text) return "";
  if (
    text.includes("还没写决定") ||
    text.includes("写下一步要做什么") ||
    text.includes("fill before marking done") ||
    text.includes("Continue from the current worktree")
  ) {
    return "";
  }
  return text;
}

function Empty({ title, body }: { title: string; body?: string }) {
  return (
    <div className="empty">
      <h2>{title}</h2>
      {body ? <p>{body}</p> : null}
    </div>
  );
}

function EngineDown() {
  return (
    <Empty
      title="引擎还没连上"
      body="工区要先开引擎。请确认本机只有一个引擎在跑，然后刷新这一页。界面不会替你执行 git。"
    />
  );
}

function FilteredEmpty() {
  return <Empty title="这个筛选下面没有行。" body="点「全部」看看。" />;
}

function pinStateLabel(state: string): string {
  if (state === "missing") return "找不到";
  if (state === "changed") return "有变动";
  if (state === "present") return "在位";
  return state;
}

const LEDGER_ACTION: Record<string, string> = {
  init: "登记仓",
  createTask: "开新任务",
  markDone: "标记完成",
  openWorktree: "创建 worktree",
  createBranch: "建分支",
  plantBranch: "检出分支",
  archiveWorktree: "归档 worktree",
  deleteBranch: "删除分支",
  syncAgents: "同步",
  editCharter: "修改宪章",
  escalateFrozen: "放开冻结层",
  pinArtifact: "钉这一版",
  unpinArtifact: "取消钉",
  "wiki.gate": "百科检查",
  lintFix: "整理百科",
  wikiWrite: "写入百科",
  ingestRaw: "收入原文",
  updatePolicy: "改规则",
};

const LEDGER_OUTCOME: Record<string, string> = {
  ok: "完成",
  pending: "等批准",
  denied: "没通过",
  exists: "本来就有",
  executed: "已执行",
  failed: "失败",
  warn: "注意",
};

function ledgerDisplay(line: string): string {
  const text = line.replace(/^##\s+/, "");
  const parts = text.split(" | ");
  if (parts.length < 2) return text;
  parts[0] = parts[0]
    .replace(/^\[(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}).*\]\s*/, "$2-$3 $4:$5 · ")
    .replace(/human$/, "人")
    .replace(/agent$/, "助手");
  if (LEDGER_ACTION[parts[1]]) parts[1] = LEDGER_ACTION[parts[1]];
  if (parts[3] && LEDGER_OUTCOME[parts[3]]) parts[3] = LEDGER_OUTCOME[parts[3]];
  return parts.join(" · ");
}

function blastReasonLabel(reason: string): string {
  if (reason.startsWith("forbidden")) return "这是禁区，不要碰。";
  if (reason.startsWith("frozen layer")) {
    const name = reason.match(/\(([^)]+)\)/)?.[1];
    return name ? `这是冻结层（${name}）。` : "这是冻结层。";
  }
  if (reason === "outside allowed paths") return "不在允许路径里。";
  if (reason.includes("i18n")) return "中英日文案要一起改。";
  if (reason.startsWith("generated")) return "这是生成文件或锁文件。";
  if (reason === "engine-owned task file") return "这是工区自己的任务文件。";
  if (reason === "in scope") return "在这张卡的范围里。";
  return "先看这张卡能碰的范围。";
}

function verdictLabel(verdict: string): string {
  if (verdict === "ok") return "通过";
  if (verdict === "warning") return "注意";
  if (verdict === "blocked") return "越界";
  return verdict;
}

function CharterPane({
  project,
  drift,
  requests,
  busy,
  onSync,
  onDecide,
  onPolicy,
}: {
  project: Project;
  drift: Drift[];
  requests: ConsentRequest[];
  busy: boolean;
  onSync: () => void;
  onDecide: (id: string, approve: boolean) => void;
  onPolicy: (partial: {
    preset?: PolicyPreset;
    agentMay?: Partial<Record<AgentAction, Consent>>;
    wiki?: Policy["wiki"];
  }) => void;
}) {
  return (
    <div className="pane">
      {drift.length ? (
        <p className="drift-line">
          AGENTS.md 托管段{{ edited: "被手改", missing: "缺失", stale: "无签名（旧格式）" }[drift[0].kind]}。
          <button className="text" disabled={busy} onClick={onSync}>同步</button>
        </p>
      ) : null}
      <RequestsList requests={requests} busy={busy} onDecide={onDecide} />
      <LayersSection project={project} />
      <PolicySection project={project} busy={busy} onPolicy={onPolicy} />
    </div>
  );
}

function LayersSection({ project }: { project: Project }) {
  return (
    <>
      <h2>分层与禁区</h2>
      <p className="hint">宪章 v{project.charter.version || 1}</p>
      <p>{project.charter.purpose}</p>
      <h3>分层</h3>
      <ul className="layers">
        {project.charter.layers.map((layer) => (
          <li key={layer.id}>
            <strong>{layer.name}</strong>
            <span className={layer.frozen ? "frozen" : "open"}>{layer.frozen ? "冻" : "开"}</span>
            <small>{layer.paths.join(", ")}</small>
          </li>
        ))}
      </ul>
      <h3>禁区</h3>
      <p>{project.charter.doNotTouch.join(", ")}</p>
    </>
  );
}

function RequestsList({
  requests,
  busy,
  onDecide,
}: {
  requests: ConsentRequest[];
  busy: boolean;
  onDecide: (id: string, approve: boolean) => void;
}) {
  return (
    <section className="inbox">
      <h2>待批准</h2>
      {requests.length === 0 ? (
        <p className="hint">没有助手在等你点头。</p>
      ) : (
        <ul className="notes">
          {requests.map((item) => (
            <li key={item.id} className="request">
              <strong>{POLICY_ACTIONS.find((action) => action.id === item.action)?.label || item.action}</strong>
              <small>{item.reason}</small>
              <div className="row">
                <button className="text" disabled={busy} onClick={() => onDecide(item.id, true)}>
                  批准
                </button>
                <button className="text" disabled={busy} onClick={() => onDecide(item.id, false)}>
                  拒绝
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function PolicySection({
  project,
  busy,
  onPolicy,
}: {
  project: Project;
  busy: boolean;
  onPolicy: (partial: {
    preset?: PolicyPreset;
    agentMay?: Partial<Record<AgentAction, Consent>>;
    wiki?: Policy["wiki"];
  }) => void;
}) {
  const policy = project.policy;
  if (!policy) return <p className="hint">这个仓还没定谁能做什么。</p>;
  return (
    <section>
      <h2>助手能做什么</h2>
      <p className="hint">伤筋动骨的事，最多做到「先问你」。</p>
      <div className="seg">
        {([
          ["locked", "锁定"],
          ["balanced", "平衡"],
          ["open", "开放"],
        ] as [PolicyPreset, string][]).map(([preset, label]) => (
          <button
            key={preset}
            className={policy.preset === preset ? "on" : ""}
            disabled={busy}
            onClick={() => onPolicy({ preset })}
          >
            {label}
          </button>
        ))}
        {policy.preset === "custom" ? <button className="on" type="button">自定义</button> : null}
      </div>
      <details className="policy-details">
        <summary>逐项授权</summary>
        {POLICY_GROUPS.map((group) => (
          <div key={group} className="policy-group">
            <h3>{group}</h3>
            {POLICY_ACTIONS.filter((item) => item.group === group).map((item) => {
              const value = policy.agentMay[item.id];
              return (
                <div key={item.id} className="policy-row">
                  <span>
                    {item.label}
                    {item.destructive ? <small> · 破坏性</small> : null}
                  </span>
                  <div className="consent">
                    {(["never", "ask", "allow"] as Consent[]).map((level) => {
                      const blocked = item.destructive && level === "allow";
                      return (
                        <button
                          key={level}
                          type="button"
                          className={`${value === level ? "on" : ""}${blocked ? " hatch" : ""}`.trim()}
                          disabled={busy || blocked}
                          onClick={() => onPolicy({ agentMay: { [item.id]: level } })}
                        >
                          {CONSENT_LABEL[level]}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
        {(["concepts", "sources", "syntheses"] as const).map((bucket) => {
          const on = policy.wiki.agentWrites[bucket];
          const label = bucket === "concepts" ? "概念" : bucket === "sources" ? "来源页" : "综合";
          return (
            <div key={bucket} className="policy-row">
              <span>助手可写百科 · {label}</span>
              <div className="consent">
                <button
                  type="button"
                  className={!on ? "on" : ""}
                  disabled={busy}
                  onClick={() =>
                    onPolicy({
                      wiki: { ...policy.wiki, agentWrites: { ...policy.wiki.agentWrites, [bucket]: false } },
                    })
                  }
                >
                  禁止
                </button>
                <button
                  type="button"
                  className={on ? "on" : ""}
                  disabled={busy}
                  onClick={() =>
                    onPolicy({
                      wiki: { ...policy.wiki, agentWrites: { ...policy.wiki.agentWrites, [bucket]: true } },
                    })
                  }
                >
                  允许
                </button>
              </div>
            </div>
          );
        })}
        <label className="policy-row">
          <span>完成前百科检查</span>
          <select
            value={policy.wiki.gate}
            disabled={busy}
            onChange={(event) => onPolicy({ wiki: { ...policy.wiki, gate: event.target.value as Policy["wiki"]["gate"] } })}
          >
            <option value="off">关闭</option>
            <option value="warn">警告</option>
            <option value="block">拦截</option>
          </select>
        </label>
        <label className="policy-row">
          <span>交接收进原文</span>
          <select
            value={policy.wiki.ingestHandoffs}
            disabled={busy}
            onChange={(event) =>
              onPolicy({ wiki: { ...policy.wiki, ingestHandoffs: event.target.value as Policy["wiki"]["ingestHandoffs"] } })
            }
          >
            <option value="always">立即</option>
            <option value="onDone">完成时</option>
          </select>
        </label>
      </details>
    </section>
  );
}

function LedgerTail({ lines }: { lines: string[] }) {
  return (
    <section>
      <h3>动作记录</h3>
      {lines.length === 0 ? (
        <p className="hint">还没有治理动作。</p>
      ) : (
        <ul className="notes">
          {lines.map((line) => (
            <li key={line}>
              <small>{ledgerDisplay(line)}</small>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function SettingsSheet({
  settings,
  onClose,
  onSave,
}: {
  settings: AppSettings | null;
  onClose: () => void;
  onSave: (partial: Partial<AppSettings>) => void;
}) {
  const [openIn, setOpenIn] = useState(settings?.openIn || "cursor");
  const [worktreesRoot, setWorktreesRoot] = useState(settings?.worktreesRoot || "");
  const [defaultPreset, setDefaultPreset] = useState<PolicyPreset>(settings?.defaultPreset || "balanced");
  const [confirmDestructive, setConfirmDestructive] = useState(settings?.confirmDestructive !== false);
  const [motion, setMotion] = useState(settings?.motion || "system");
  const [skin, setSkin] = useState<AppSkin>(settings?.skin === "forge" ? "forge" : "lean");
  const [forgeDecor, setForgeDecor] = useState<"off" | "on">(settings?.forgeDecor === "on" ? "on" : "off");
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(event) => event.stopPropagation()}>
        <p className="eyebrow">机器设置</p>
        <h2>这台机器</h2>
        <p className="eyebrow">视图皮肤</p>
        <div className="skin-pick" role="radiogroup" aria-label="视图皮肤">
          <button
            type="button"
            className={skin === "lean" ? "on" : ""}
            onClick={() => setSkin("lean")}
          >
            <strong>干练</strong>
            <span>现在这套纸面工区。列表清楚，少装饰。</span>
          </button>
          <button
            type="button"
            className={skin === "forge" ? "on" : ""}
            onClick={() => setSkin("forge")}
          >
            <strong>工场</strong>
            <span>深色主题。列表和检查器保持静止，方便阅读。</span>
          </button>
        </div>
        <label className="check">
          <input
            type="checkbox"
            disabled={skin !== "forge"}
            checked={forgeDecor === "on"}
            onChange={(event) => setForgeDecor(event.target.checked ? "on" : "off")}
          />
          工场装饰
        </label>
        <p className="hint">默认关。打开后只加一层底色，不扭列表、不转工位。</p>
        <label className="policy-row">
          <span>打开配方</span>
          <select value={openIn} onChange={(event) => setOpenIn(event.target.value as AppSettings["openIn"])}>
            <option value="cursor">Cursor</option>
            <option value="vscode">VS Code</option>
            <option value="finder">Finder</option>
            <option value="terminal">终端</option>
            <option value="none">只复制路径</option>
          </select>
        </label>
        <p className="hint">只复制命令，不替你开软件。请在本机终端自己粘贴。</p>
        <label className="policy-row">
          <span>新树放在哪</span>
          <input
            value={worktreesRoot}
            onChange={(event) => setWorktreesRoot(event.target.value)}
            placeholder="~/Workzoon/worktrees"
          />
        </label>
        <p className="hint">新的工作目录：根目录 / 项目名 / 任务名。已经建好的不搬家。</p>
        <label className="policy-row">
          <span>新登记仓的默认预设</span>
          <select value={defaultPreset} onChange={(event) => setDefaultPreset(event.target.value as PolicyPreset)}>
            <option value="locked">锁定</option>
            <option value="balanced">平衡</option>
            <option value="open">开放</option>
          </select>
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={confirmDestructive}
            onChange={(event) => setConfirmDestructive(event.target.checked)}
          />
          破坏性操作要求输入名称确认
        </label>
        <label className="policy-row">
          <span>动效</span>
          <select value={motion} onChange={(event) => setMotion(event.target.value as AppSettings["motion"])}>
            <option value="system">跟随系统</option>
            <option value="off">关闭</option>
          </select>
        </label>
        <div className="row">
          <button
            className="primary"
            onClick={() => onSave({ openIn, worktreesRoot, defaultPreset, confirmDestructive, motion, skin, forgeDecor })}
          >
            保存
          </button>
          <button onClick={onClose}>取消</button>
        </div>
      </div>
    </div>
  );
}

function RegisterSheet({
  nameDraft,
  rootDraft,
  busy,
  onName,
  onRoot,
  onClose,
  onSubmit,
}: {
  nameDraft: string;
  rootDraft: string;
  busy: boolean;
  onName: (value: string) => void;
  onRoot: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(event) => event.stopPropagation()}>
        <p className="eyebrow">登记仓</p>
        <h2>把这个仓库登记进来</h2>
        <input value={nameDraft} onChange={(event) => onName(event.target.value)} placeholder="项目名" />
        <input value={rootDraft} onChange={(event) => onRoot(event.target.value)} placeholder="仓库最外面那一层，不要填已经开出来的树" />
        <div className="row">
          <button className="primary" disabled={busy} onClick={onSubmit}>
            登记这个仓库
          </button>
          <button onClick={onClose}>取消</button>
        </div>
      </div>
    </div>
  );
}

function relCite(abs: string, ...roots: string[]): string {
  const raw = abs.trim().replace(/^@/, "");
  if (!raw.startsWith("/")) return raw;
  for (const root of roots) {
    if (!root) continue;
    const prefix = root.endsWith("/") ? root : `${root}/`;
    if (raw.startsWith(prefix)) return raw.slice(prefix.length);
  }
  return raw;
}

function MapPane({
  project,
  task,
  occupancy,
  loop,
  lane,
  files,
  browsePath,
  busy,
  onCopy,
  onBrowse,
  onLoop,
  onOpen,
  onPlant,
  openIn,
  onPulse,
  onClearPulse,
  pulseFocus,
  onFocusPulse,
}: {
  project: Project;
  task: Task | null;
  occupancy?: Occupancy;
  loop: ReturnType<typeof loopFromOccupancy> | null;
  lane: RepoLane | null;
  files: SourceEntry[];
  browsePath: string;
  busy: boolean;
  onCopy: (label: string, value: string) => void;
  onBrowse: (path: string) => void;
  onLoop?: (step: LoopStep) => void;
  onOpen?: () => void;
  onPlant?: () => void;
  openIn: AppSettings["openIn"];
  onPulse?: (doing: string, cite: { kind: "path" | "sha"; value: string }, remainMin?: number) => void;
  onClearPulse?: () => void;
  pulseFocus?: number;
  onFocusPulse?: () => void;
}) {
  const owned = task ? laneOf(project, task) : null;
  const branch = lane?.branch || owned?.branch || project.baseBranch;
  const path = bayPath(lane?.worktreePath, project.rootPath) || bayPath(owned?.path, project.rootPath);
  const recipe = path ? openRecipe(openIn, path) : null;
  const stackedBase =
    lane?.baseBranch ||
    (task?.baseBranch && task.baseBranch !== project.baseBranch ? task.baseBranch : undefined);
  const [citeHint, setCiteHint] = useState<{ kind: "path" | "sha"; value: string; nonce: number }>();
  const intent = nextHandIntent(loop);
  const planted = Boolean(path || loop?.lit.tree);
  return (
    <div className="pane">
      <h2>{task?.title || lane?.subject || project.name}</h2>
      {task && loop ? (
        <LoopRail
          loop={loop}
          onStep={(step) => onLoop?.(step)}
        />
      ) : null}
      <ol className="map">
        <li>
          <em>仓</em>
          <button className="link" title={project.rootPath} onClick={() => onCopy("仓库路径", project.rootPath)}>
            {shorten(project.rootPath)}
          </button>
        </li>
        <li>
          <em>分支</em>
          <button className="link" onClick={() => onCopy("分支", branch)}>
            {branch}
          </button>
          {stackedBase ? <small> · 基线 {stackedBase}</small> : null}
        </li>
        <li>
          <em>路径</em>
          <button className="link" title={path || undefined} onClick={() => path && onCopy("路径", path)}>
            {path ? shorten(path) : "创建后才会有独立目录"}
          </button>
        </li>
      </ol>
      {occupancy ? (
        <div className="occupancy-detail">
          <OccupancyStrip occupancy={occupancy} />
          <p className="hint">
            {occupancy.sha12 ? (
              <button
                type="button"
                className="link"
                onClick={() => {
                  setCiteHint({ kind: "sha", value: occupancy.sha12, nonce: Date.now() });
                  onCopy("版本", occupancy.sha12);
                }}
              >
                版本 {occupancy.sha12}
              </button>
            ) : (
              "还没有版本号"
            )}
            {occupancy.ahead ? ` · 领先 ${occupancy.ahead}` : ""}
            {occupancy.behind ? ` · 落后 ${occupancy.behind}` : ""}
            {occupancy.files ? ` · 相对主干 ${occupancy.files} 个文件` : ""}
          </p>
        </div>
      ) : null}
      {task && onPulse && planted ? (
        <PulseBox
          occupancy={occupancy}
          sha={occupancy?.sha12 || lane?.sha || ""}
          citeRoots={[path, project.rootPath]}
          busy={busy}
          citeHint={citeHint}
          focusNonce={pulseFocus}
          primary={intent === "pulse"}
          onPulse={onPulse}
          onClear={onClearPulse}
        />
      ) : null}
      {task ? (
        <>
          <p className="hint">这张卡能改 {task.allowedPaths.join(", ") || "没冻住的部分"} · 助手是 {task.agent}。只给打开办法，不替你开软件。</p>
          {intent === "tree" && onOpen ? (
            <button className="primary" disabled={busy} onClick={onOpen}>
              {loop?.verb || "创建 worktree"}
            </button>
          ) : intent === "handoff" ? (
            <button className="primary" type="button" onClick={() => onLoop?.("handoff")}>
              {loop?.verb}
            </button>
          ) : intent === "done" || intent === "wiki" ? (
            <button className="primary" type="button" onClick={() => onLoop?.("done")}>
              {loop?.verb}
            </button>
          ) : null}
        </>
      ) : (
        <>
          <p className="hint">这是仓库里已有的分支。点路径复制给助手；还没开目录的可以创建 worktree。只给打开办法，不替你开软件。</p>
          {onPlant ? (
            <button className="primary" disabled={busy} onClick={onPlant}>
              检出这条分支
            </button>
          ) : null}
        </>
      )}
      {recipe ? (
        <p className="hint">
          <button type="button" className="link" onClick={() => onCopy(recipe.label, recipe.command)}>
            复制配方 · {recipe.label}
          </button>
        </p>
      ) : null}
      <h3>源码</h3>
      <p className="crumb">
        <button className="chip" onClick={() => onBrowse(path || project.rootPath)}>
          {shorten(browsePath)}
        </button>
      </p>
      <ul className="files">
        {files.map((entry) => (
          <li key={entry.path}>
            <button
              className="link"
              onClick={() => {
                if (entry.kind === "dir") onBrowse(entry.path);
                else {
                  setCiteHint({
                    kind: "path",
                    value: relCite(entry.path, path, project.rootPath),
                    nonce: Date.now(),
                  });
                  onCopy("文件", entry.path);
                }
              }}
            >
              {entry.kind === "dir" ? "▸ " : ""}
              {entry.name}
            </button>
          </li>
        ))}
      </ul>
      <p className="hint">j / k 换行。/ 百科，2 交接，n 下一手。f 全部分支，l 任务。</p>
    </div>
  );
}

function HandoffPane({
  decisionDraft,
  nextDraft,
  handoffText,
  promptText,
  loop,
  busy,
  onLoop,
  onOpen,
  onDecision,
  onNext,
  onGenerate,
  onDone,
}: {
  decisionDraft: string;
  nextDraft: string;
  handoffText: string;
  promptText: string;
  loop: ReturnType<typeof loopFromOccupancy> | null;
  busy: boolean;
  onLoop?: (step: LoopStep) => void;
  onOpen?: () => void;
  onDecision: (value: string) => void;
  onNext: (value: string) => void;
  onGenerate: () => void;
  onDone: () => void;
}) {
  const intent = nextHandIntent(loop);
  const canDone = loop ? loop.verb === "标记完成" : Boolean(handoffText);
  return (
    <div className="pane">
      <h2>交接</h2>
      {loop ? (
        <LoopRail
          loop={loop}
          onStep={(step) => {
            onLoop?.(step);
          }}
        />
      ) : null}
      {intent === "tree" ? null : (
        <>
          <textarea value={decisionDraft} onChange={(event) => onDecision(event.target.value)} placeholder="决定与理由" />
          <textarea value={nextDraft} onChange={(event) => onNext(event.target.value)} placeholder="下一步的具体动作" />
        </>
      )}
      <div className="row">
        {intent === "tree" ? (
          <button className="primary" disabled={busy} onClick={() => (onOpen ? onOpen() : onLoop?.("tree"))}>
            {loop?.verb || "创建 worktree"}
          </button>
        ) : intent === "pulse" ? (
          <button className="primary" type="button" onClick={() => onLoop?.("pulse")}>
            {loop?.verb || "登记心跳"}
          </button>
        ) : intent === "wiki" ? (
          <button className="primary" type="button" onClick={() => onLoop?.("done")}>
            {loop?.verb}
          </button>
        ) : intent === "done" ? (
          <button className="primary" disabled={busy || !canDone} onClick={onDone}>
            {loop?.verb || "标记完成"}
          </button>
        ) : intent === "handoff" ? (
          <button className="primary" disabled={busy} onClick={onGenerate}>
            生成交接
          </button>
        ) : null}
        {intent === "handoff" || !intent ? (
          <button disabled={busy || !canDone} onClick={onDone}>
            标记完成
          </button>
        ) : intent === "pulse" || intent === "done" || intent === "wiki" ? (
          <button disabled={busy} onClick={onGenerate}>
            生成交接
          </button>
        ) : null}
      </div>
      {handoffText ? (
        <details className="policy-details">
          <summary>原始交接</summary>
          <p className="hint">上面两格是给人看的。这份原文留给下一位助手。</p>
          <pre>{handoffText}</pre>
        </details>
      ) : intent === "tree" ? null : (
        <p className="hint">写上决定和下一步，才能完成。</p>
      )}
      {promptText ? (
        <button onClick={() => void navigator.clipboard.writeText(promptText)}>复制给下一位助手</button>
      ) : null}
    </div>
  );
}

function BlastPane({ blast, busy, onCheck }: { blast: BlastReport | null; busy: boolean; onCheck: () => void }) {
  return (
    <div className="pane">
      <h2>影响范围</h2>
      <button className="primary" disabled={busy} onClick={onCheck}>
        对照宪章检查
      </button>
      {blast ? (
        <>
          <p className={`verdict ${blast.verdict}`}>{verdictLabel(blast.verdict)}</p>
          <p className="hint">对照宪章 v{blast.charterVersion}</p>
          <ul className="findings">
            {blast.findings.map((item) => (
              <li key={`${item.path}-${item.reason}`}>
                <span className={item.verdict}>{verdictLabel(item.verdict)}</span>
                <code>{item.path}</code>
                <small>{blastReasonLabel(item.reason)}</small>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="hint">只看这张卡自己的目录，不会翻整仓。</p>
      )}
    </div>
  );
}
