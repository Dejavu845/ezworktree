import { GuardError } from "./guard.ts";
import { PolicyError, renderPolicyMarkdown } from "./policy.ts";
import {
  archiveWorktree,
  blastForTask,
  clearTaskPulse,
  createTask,
  decideRequest,
  deleteBranch,
  generateHandoff,
  guardStaged,
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
  updatePolicy,
  wikiIngest,
  wikiLint,
  wikiWrite,
  unpinProjectArtifact,
  wikiList,
  writeTaskPulse,
} from "./service.ts";
import { WikiWriteError } from "./wiki.ts";
import type { AppSettings, Caller, Policy } from "./types.ts";

const argv = process.argv.slice(2);
const cmd = argv[0];
const rest = argv.slice(1);

function arg(name: string, fallback = ""): string {
  const idx = rest.findIndex((item) => item === `--${name}`);
  if (idx === -1) return fallback;
  return rest[idx + 1] || fallback;
}

function caller(): Caller {
  const actor = arg("actor", "agent");
  const consent = arg("consent");
  return {
    actor: actor === "human" ? "human" : "agent",
    agent: arg("agent") || undefined,
    consent: consent === "1" || consent === "true",
  };
}

function print(value: unknown): void {
  process.stdout.write(`${typeof value === "string" ? value : JSON.stringify(value, null, 2)}\n`);
}

function settingsPatch(): Partial<AppSettings> {
  const patch: Partial<AppSettings> = {};
  if (arg("openIn")) patch.openIn = arg("openIn") as AppSettings["openIn"];
  if (arg("worktreesRoot")) patch.worktreesRoot = arg("worktreesRoot");
  if (arg("defaultPreset")) patch.defaultPreset = arg("defaultPreset") as AppSettings["defaultPreset"];
  if (arg("confirmDestructive")) patch.confirmDestructive = arg("confirmDestructive") !== "0";
  if (arg("motion")) patch.motion = arg("motion") as AppSettings["motion"];
  if (arg("skin")) patch.skin = arg("skin") as AppSettings["skin"];
  if (arg("forgeDecor")) patch.forgeDecor = arg("forgeDecor") as AppSettings["forgeDecor"];
  return patch;
}

try {
  const who = caller();
  const root = arg("root", process.cwd());
  if (cmd === "init") print(initProject(root, arg("name") || undefined, arg("group", "studio")));
  else if (cmd === "snapshot") print(snapshotWithMaps());
  else if (cmd === "drift") print(projectDrift(root));
  else if (cmd === "sync") print(syncAgents(root, who, arg("task") || undefined));
  else if (cmd === "map") print(projectMap(root));
  else if (cmd === "graph") print(projectGraph(root));
  else if (cmd === "holdings") print(projectHoldings(root).markdown);
  else if (cmd === "artifact") {
    const sub = rest[0];
    if (sub === "pin") {
      print(
        pinProjectArtifact(
          root,
          {
            name: arg("name"),
            checkout: arg("checkout") || undefined,
            branch: arg("branch") || undefined,
            note: arg("note") || undefined,
            taskId: arg("task") || undefined,
          },
          who,
        ),
      );
    } else if (sub === "unpin") print(unpinProjectArtifact(root, arg("id"), who));
    else if (sub === "list") print(listArtifacts(root));
    else throw new Error("workzoon artifact <pin|unpin|list>");
  }
  else if (cmd === "plant") print(plantBranch(root, arg("branch"), who));
  else if (cmd === "files") print(sourceList(root, arg("path") || undefined));
  else if (cmd === "wiki") print(wikiList(root, arg("q")));
  else if (cmd === "ingest") print(wikiIngest(root, arg("title"), arg("body"), arg("topic") || undefined, who));
  else if (cmd === "wiki-write")
    print(
      wikiWrite(
        root,
        {
          bucket: (arg("bucket") || "sources") as "concepts" | "sources" | "syntheses",
          title: arg("title"),
          body: arg("body"),
        },
        who,
      ),
    );
  else if (cmd === "lint") print(wikiLint(root, arg("fix") === "1", who));
  else if (cmd === "task")
    print(
      createTask(
        root,
        {
          title: arg("title"),
          intent: arg("intent") || undefined,
          baseBranch: arg("base") || undefined,
          allowedPaths: arg("allow").split(",").filter(Boolean),
          allowFrozenTouch: arg("frozen") === "1",
          escalationReason: arg("reason") || undefined,
        },
        who,
      ),
    );
  else if (cmd === "tree") print(openWorktree(root, arg("task"), who));
  else if (cmd === "archive") print(archiveWorktree(root, arg("task"), arg("force") === "1", who, arg("confirm") || undefined));
  else if (cmd === "blast") print(blastForTask(root, arg("task")));
  else if (cmd === "guard") print(guardStaged(root, { taskId: arg("task") || undefined, override: arg("override") === "1" }));
  else if (cmd === "pulse") {
    if (arg("clear") === "1") print(clearTaskPulse(root, arg("task"), who));
    else {
      const citeRaw = arg("cite");
      const [kind, ...restCite] = citeRaw.split(":");
      print(
        writeTaskPulse(
          root,
          {
            taskId: arg("task"),
            doing: arg("doing"),
            remainMin: arg("remain") ? Number(arg("remain")) : undefined,
            cite: { kind: kind || "path", value: restCite.join(":") || arg("value") },
          },
          who,
        ),
      );
    }
  }
  else if (cmd === "handoff") print(generateHandoff(root, arg("task"), { toAgent: arg("to", "next-agent") }));
  else if (cmd === "done") print(markDone(root, arg("task"), who));
  else if (cmd === "policy") {
    const preset = arg("preset");
    const json = arg("json");
    if (preset || json) {
      const partial = (json ? JSON.parse(json) : { preset }) as Partial<Policy>;
      print(updatePolicy(root, partial, who));
    } else {
      const policy = getPolicy(root);
      print(arg("md") === "1" ? renderPolicyMarkdown(policy) : policy);
    }
  } else if (cmd === "settings") {
    const patch = settingsPatch();
    print(Object.keys(patch).length ? updateAppSettings(patch) : getAppSettings());
  }   else if (cmd === "branch-delete") print(deleteBranch(root, arg("branch"), arg("force") === "1", who, arg("confirm") || undefined));
  else if (cmd === "ledger") print(projectLedger(root) || "(empty)");
  else if (cmd === "requests") print(listConsentRequests(root));
  else if (cmd === "approve") print(decideRequest(root, arg("id"), true, who, arg("note") || undefined));
  else if (cmd === "deny") print(decideRequest(root, arg("id"), false, who, arg("note") || undefined));
  else {
    print(`workzoon <init|snapshot|drift|sync|map|graph|holdings|artifact|plant|files|wiki|ingest|wiki-write|lint|task|tree|archive|blast|guard|pulse|handoff|done|policy|settings|branch-delete|ledger|requests|approve|deny>
  artifact pin|unpin|list --name <artifact> --id <pin> --checkout <path> --note <text>
  pulse --task <id> --doing <text> --cite path:file|--cite sha:<sha> --remain <min> --clear 1
  guard --staged --task <id>   LATTICE_OVERRIDE=1 to pass a blocked commit
  --root <path> --actor human|agent --agent <name> --consent 1
  --title <title> --task <id> --intent feat|spike|hotfix --base <branch> --branch <name> --allow <globs> --frozen 1 --reason <text> --to <agent> --q <query> --body <text> --bucket concepts|sources|syntheses --force 1 --id <request>
  Default actor is agent (fail closed). Humans must pass --actor human.`);
    process.exitCode = cmd ? 1 : 0;
  }
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : error}\n`);
  process.exitCode =
    error instanceof PolicyError || error instanceof WikiWriteError ? 2 : error instanceof GuardError ? 1 : 1;
}
