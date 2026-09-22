import { createServer, type IncomingMessage } from "node:http";
import { URL } from "node:url";
import { PolicyError } from "./policy.ts";
import { WikiWriteError } from "./wiki.ts";
import {
  archiveWorktree,
  blastForTask,
  clearTaskPulse,
  createTask,
  decideRequest,
  deleteBranch,
  generateHandoff,
  handoffView,
  getAppSettings,
  getPolicy,
  initProject,
  listConsentRequests,
  markDone,
  openWorktree,
  plantBranch,
  projectDrift,
  projectGraph,
  listArtifacts,
  pinProjectArtifact,
  projectHoldings,
  projectLedger,
  projectMap,
  snapshotWithMaps,
  syncAgents,
  sourceList,
  updateAppSettings,
  updateCharter,
  updatePolicy,
  vaultList,
  vaultSearch,
  wikiIngest,
  wikiLint,
  wikiList,
  wikiWrite,
  unpinProjectArtifact,
  wikiPage,
  writeTaskPulse,
} from "./service.ts";
import { latticeHome } from "./store.ts";
import type { Caller } from "./types.ts";

const PORT = Number(process.env.LATTICE_PORT || 7780);

function send(res: import("node:http").ServerResponse, status: number, body: unknown): void {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(json),
  });
  res.end(json);
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function callerOf(req: IncomingMessage): Caller {
  const actor = String(req.headers["x-workzoon-actor"] || "").toLowerCase();
  const agent = String(req.headers["x-workzoon-agent"] || "") || undefined;
  const consentRaw = String(req.headers["x-workzoon-consent"] || "").toLowerCase();
  return {
    actor: actor === "human" ? "human" : "agent",
    agent,
    consent: consentRaw === "true" || consentRaw === "1",
  };
}

function wrap(res: import("node:http").ServerResponse, fn: () => unknown): void {
  try {
    send(res, 200, fn());
  } catch (error) {
    if (error instanceof PolicyError) {
      send(res, 403, { error: error.message, code: error.code, action: error.action, requestId: error.requestId });
      return;
    }
    if (error instanceof WikiWriteError) {
      send(res, 403, { error: error.message, code: error.code, bucket: error.bucket });
      return;
    }
    send(res, 400, { error: error instanceof Error ? error.message : String(error) });
  }
}

const server = createServer(async (req, res) => {
  if (!req.url || !req.method) return send(res, 400, { error: "bad request" });
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const path = url.pathname;
  const caller = callerOf(req);

  if (req.method === "GET" && path === "/api/health") {
    return send(res, 200, { ok: true, product: "Agent Workzoon", home: latticeHome() });
  }
  if (req.method === "GET" && path === "/api/snapshot") {
    return wrap(res, () => snapshotWithMaps());
  }
  if (req.method === "GET" && path === "/api/map") {
    return wrap(res, () => projectMap(url.searchParams.get("root") || ""));
  }
  if (req.method === "GET" && path === "/api/graph") {
    return wrap(res, () => projectGraph(url.searchParams.get("root") || ""));
  }
  if (req.method === "GET" && path === "/api/vault") {
    const root = url.searchParams.get("root") || "";
    const query = url.searchParams.get("q") || "";
    return wrap(res, () => (query ? vaultSearch(root, query) : vaultList(root)));
  }
  if (req.method === "GET" && path === "/api/wiki") {
    return wrap(res, () => wikiList(url.searchParams.get("root") || "", url.searchParams.get("q") || ""));
  }
  if (req.method === "GET" && path === "/api/wiki/page") {
    return wrap(res, () => wikiPage(url.searchParams.get("root") || "", url.searchParams.get("path") || ""));
  }
  if (req.method === "GET" && path === "/api/wiki/lint") {
    return wrap(res, () => wikiLint(url.searchParams.get("root") || "", url.searchParams.get("fix") === "1", caller));
  }
  if (req.method === "GET" && path === "/api/files") {
    return wrap(res, () => sourceList(url.searchParams.get("root") || "", url.searchParams.get("path") || undefined));
  }
  if (req.method === "GET" && path === "/api/holdings") {
    return wrap(res, () => projectHoldings(url.searchParams.get("root") || ""));
  }
  if (req.method === "GET" && path === "/api/artifacts") {
    return wrap(res, () => listArtifacts(url.searchParams.get("root") || ""));
  }
  if (req.method === "GET" && path === "/api/settings") {
    return wrap(res, () => getAppSettings());
  }
  if (req.method === "GET" && path === "/api/policy") {
    return wrap(res, () => getPolicy(url.searchParams.get("root") || ""));
  }
  if (req.method === "GET" && path === "/api/ledger") {
    return wrap(res, () => ({ markdown: projectLedger(url.searchParams.get("root") || "") }));
  }
  if (req.method === "GET" && path === "/api/requests") {
    return wrap(res, () => listConsentRequests(url.searchParams.get("root") || ""));
  }
  if (req.method === "GET" && path === "/api/drift") {
    return wrap(res, () => projectDrift(url.searchParams.get("root") || ""));
  }
  if (req.method === "GET" && path === "/api/handoff") {
    return wrap(res, () => handoffView(url.searchParams.get("root") || "", url.searchParams.get("task") || ""));
  }

  if (req.method !== "POST") return send(res, 404, { error: "not found" });
  let body: Record<string, unknown> = {};
  try {
    body = await readJson(req);
  } catch {
    return send(res, 400, { error: "invalid json" });
  }
  const root = String(body.rootPath || "");

  if (path === "/api/init") return wrap(res, () => initProject(root, body.name as string, (body.groupId as string) || "studio"));
  if (path === "/api/charter") return wrap(res, () => updateCharter(root, body.charter as never, caller));
  if (path === "/api/tasks") return wrap(res, () => createTask(root, body as never, caller));
  if (path === "/api/worktrees/open") return wrap(res, () => openWorktree(root, String(body.taskId), caller));
  if (path === "/api/worktrees/plant") return wrap(res, () => plantBranch(root, String(body.branch || ""), caller));
  if (path === "/api/worktrees/archive") {
    return wrap(res, () =>
      archiveWorktree(root, String(body.taskId), Boolean(body.force), caller, body.confirm as string | undefined),
    );
  }
  if (path === "/api/blast") return wrap(res, () => blastForTask(root, String(body.taskId)));
  if (path === "/api/pulse") {
    return wrap(res, () =>
      writeTaskPulse(
        root,
        {
          taskId: String(body.taskId || ""),
          doing: String(body.doing || ""),
          remainMin: body.remainMin === undefined || body.remainMin === "" ? undefined : Number(body.remainMin),
          cite: (body.cite as { kind: string; value: string }) || { kind: String(body.kind || "path"), value: String(body.value || "") },
        },
        caller,
      ),
    );
  }
  if (path === "/api/pulse/clear") return wrap(res, () => clearTaskPulse(root, String(body.taskId), caller));
  if (path === "/api/handoff") {
    return wrap(res, () =>
      generateHandoff(root, String(body.taskId), {
        toAgent: body.toAgent as string,
        decisions: body.decisions as string,
        nextAction: body.nextAction as string,
      }),
    );
  }
  if (path === "/api/done") return wrap(res, () => markDone(root, String(body.taskId), caller));
  if (path === "/api/wiki/ingest") {
    return wrap(res, () => wikiIngest(root, String(body.title || ""), String(body.body || ""), body.topic as string, caller));
  }
  if (path === "/api/wiki/write") {
    return wrap(res, () =>
      wikiWrite(
        root,
        {
          bucket: (body.bucket as "concepts" | "sources" | "syntheses") || "sources",
          title: String(body.title || ""),
          body: String(body.body || ""),
        },
        caller,
      ),
    );
  }
  if (path === "/api/wiki/lint") return wrap(res, () => wikiLint(root, Boolean(body.fix), caller));
  if (path === "/api/settings") return wrap(res, () => updateAppSettings(body as never));
  if (path === "/api/policy") return wrap(res, () => updatePolicy(root, body.policy as never || body, caller));
  if (path === "/api/branches/delete") {
    return wrap(res, () =>
      deleteBranch(
        root,
        String(body.branch || body.name || ""),
        Boolean(body.force),
        caller,
        body.confirm as string | undefined,
      ),
    );
  }
  if (path === "/api/requests/decide") {
    return wrap(res, () =>
      decideRequest(root, String(body.id || body.requestId || ""), Boolean(body.approve), caller, body.note as string),
    );
  }
  if (path === "/api/agents/sync") {
    return wrap(res, () => syncAgents(root, caller, body.taskId as string | undefined));
  }
  if (path === "/api/artifacts/pin") {
    return wrap(res, () =>
      pinProjectArtifact(
        root,
        {
          name: String(body.name || ""),
          checkout: body.checkout ? String(body.checkout) : undefined,
          branch: body.branch ? String(body.branch) : undefined,
          note: body.note ? String(body.note) : undefined,
          taskId: body.taskId ? String(body.taskId) : undefined,
        },
        caller,
      ),
    );
  }
  if (path === "/api/artifacts/unpin") {
    return wrap(res, () => unpinProjectArtifact(root, String(body.id || ""), caller));
  }

  send(res, 404, { error: "not found" });
});

server.on("error", (error) => {
  process.stderr.write(`${error instanceof Error ? error.message : error}\n`);
  process.exit(1);
});

server.listen(PORT, "127.0.0.1", () => {
  process.stdout.write(`Agent Workzoon engine on http://127.0.0.1:${PORT} (home ${latticeHome()})\n`);
});
